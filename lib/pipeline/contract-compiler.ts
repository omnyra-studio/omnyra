/**
 * Contract Compiler — Layer 4
 *
 * Compiles SceneSkeleton + VoiceTiming + DirectorPlan into SceneContracts.
 * SceneContracts are DERIVED artifacts — not creative outputs.
 * They are the immutable execution specification for all downstream stages.
 *
 * Compile-time guarantees:
 * - Every contract has the exact character promptFragment from the CharacterBible
 * - Every contract has a specific camera spec (never "cinematic")
 * - Every contract has a ONE-action video prompt
 * - Timing is authoritative from VoiceEngine — never estimated
 */

import type {
  DirectorPlan,
  SceneSkeleton,
  VoiceTiming,
  SceneContract,
  CameraSpec,
  CharacterSpec,
  LocationSpec,
  BrandMemory,
} from "./types";
import { getNicheSettings } from "../config/nicheSettings";

const SHARED_NEGATIVE =
  "blur, low quality, watermark, text overlay, written words, legible text, " +
  "extra limbs, extra fingers, mutated hands, deformed anatomy, body horror, " +
  "nude, naked, topless, bare shoulders, strapless, off-shoulder, low-cut, cleavage, " +
  "revealing clothing, nsfw, sexual, explicit, " +
  "unstable motion, chaotic jitter, back of head only, " +
  // Anti-stylization — removes "AI look"
  "cinematic grade, dramatic lighting, epic atmosphere, beautiful lighting, " +
  "lens flare, anamorphic bokeh, film grain, color grading, vignette, " +
  "surreal, fantasy, hyperrealistic, oversharpened, neon, glowing, stylized, " +
  "multiple people, crowd, extra characters not in scene";

// ── Niche detection ───────────────────────────────────────────────────────────

type Niche = "horror" | "romance" | "action" | "drama" | "comedy" | "neutral";

function detectNiche(niche: string): Niche {
  const n = niche.toLowerCase();
  if (/horror|scary|dark|haunt|fear|stalked|abandoned/.test(n)) return "horror";
  if (/romance|love|kiss|relationship|reunion/.test(n))          return "romance";
  if (/action|fight|chase|battle|escape/.test(n))                return "action";
  if (/drama|sad|loss|death|goodbye|grief/.test(n))              return "drama";
  if (/comedy|funny|joke|prank|humor/.test(n))                   return "comedy";
  return "neutral";
}

// Niche → camera bias applied on top of base camera rules
interface NicheRules {
  preferClose:   boolean;  // favor close/medium shots
  preferWide:    boolean;  // favor wide shots
  staticDefault: boolean;  // camera static unless action requires
  lowLight:      boolean;  // imply low-light framing
  softLight:     boolean;  // imply soft/warm framing
}

const NICHE_RULES: Record<Niche, NicheRules> = {
  horror:  { preferClose: true,  preferWide: false, staticDefault: true,  lowLight: true,  softLight: false },
  romance: { preferClose: true,  preferWide: false, staticDefault: true,  lowLight: false, softLight: true  },
  action:  { preferClose: false, preferWide: true,  staticDefault: false, lowLight: false, softLight: false },
  drama:   { preferClose: true,  preferWide: false, staticDefault: true,  lowLight: false, softLight: false },
  comedy:  { preferClose: false, preferWide: false, staticDefault: true,  lowLight: false, softLight: false },
  neutral: { preferClose: false, preferWide: false, staticDefault: true,  lowLight: false, softLight: false },
};

// ── Main export ───────────────────────────────────────────────────────────────

export function compileContracts(
  plan:         DirectorPlan,
  skeletons:    SceneSkeleton[],
  timings:      VoiceTiming[],
  brandMemory?: BrandMemory,
): SceneContract[] {
  if (skeletons.length !== timings.length) {
    throw new Error(
      `Contract compile error: ${skeletons.length} skeletons vs ${timings.length} timings`
    );
  }

  const niche = detectNiche(plan.niche);
  return skeletons.map((skeleton, i) => compileOne(plan, skeleton, timings[i], niche, brandMemory));
}

// ── Single contract compilation ───────────────────────────────────────────────

function compileOne(
  plan:        DirectorPlan,
  skeleton:    SceneSkeleton,
  timing:      VoiceTiming,
  niche:       Niche,
  brand?:      BrandMemory,
): SceneContract {
  // Resolve entity references
  const characters = resolveCharacters(plan, skeleton.characterIndices);
  const location   = resolveLocation(plan, skeleton.locationIndex);

  console.log(
    `[CHAR_RESOLVE] scene=${skeleton.index + 1} indices=[${skeleton.characterIndices.join(",")}] ` +
    `→ names=[${characters.map(c => c.name).join(",")}]`
  );
  if (plan.characters.length > 1 && characters.length === 1) {
    console.warn(
      `[CHARACTER_BIBLE_WARN] scene=${skeleton.index + 1} expected multiple characters ` +
      `(plan has ${plan.characters.length}) but only got 1 — Director may have defaulted all scenes to index 0`
    );
  }

  // Merge plan-level camera with per-scene overrides + niche bias + brand overlay
  const camera = resolveCamera(plan, skeleton, niche, brand);

  // Clip duration: always 10s — assembly trims to voice duration during stitch.
  // 5s clips caused 25s output (5+10+10) for a 30s target when the hook narration was short.
  const voiceSec      = timing.durationMs / 1000;
  const clipDurationSec = 10;
  console.info(`[CLIP_DURATION_CALC] scene=${skeleton.index + 1} voiceSec=${voiceSec.toFixed(1)} calculatedClip=${clipDurationSec}s`);

  // Build locked prompts from compiled data
  const imagePrompt   = buildImagePrompt(skeleton, characters, location, camera, niche);
  const videoPrompt   = buildVideoPrompt(skeleton, characters, location, camera, niche, plan);
  const negativePrompt = buildNegativePrompt(skeleton, characters);

  console.log(
    `[COMPILE] scene=${skeleton.index + 1} role=${skeleton.narrativeRole} ` +
    `voiceSec=${voiceSec.toFixed(1)} clip=${clipDurationSec}s ` +
    `action="${skeleton.actionUnit.slice(0, 40)}"`
  );

  return {
    index:         skeleton.index,
    narrativeRole: skeleton.narrativeRole,

    durationSec:      voiceSec,
    clipDurationSec:  clipDurationSec as 5 | 10,
    voiceStartMs:     timing.startMs,
    voiceEndMs:       timing.endMs,

    narrationText:     skeleton.narrationBeat,
    action:            skeleton.actionUnit,
    emotion:           skeleton.emotionalState,
    motion:            skeleton.motion,
    retentionRole:     skeleton.retentionRole,
    requiredProps:     skeleton.requiredProps,
    forbiddenElements: skeleton.forbiddenElements,
    transitionOut:     skeleton.transitionOut,

    characters,
    location,
    camera,

    imagePrompt,
    videoPrompt,
    negativePrompt,
  };
}

// ── Entity resolution ─────────────────────────────────────────────────────────

function resolveCharacters(plan: DirectorPlan, indices: number[]): CharacterSpec[] {
  return indices
    .filter(i => i >= 0 && i < plan.characters.length)
    .map(i => plan.characters[i]);
}

function resolveLocation(plan: DirectorPlan, index: number): LocationSpec {
  return plan.locations[Math.min(index, plan.locations.length - 1)] ??
    { name: "unknown", environment: "", lighting: "", weather: "", timeOfDay: "", colors: "", promptFragment: "" };
}

// Emotion → shot distance (deterministic, not AI-interpreted)
function emotionToShotSize(emotion: string, niche: NicheRules): string {
  const e = emotion.toLowerCase();
  const isIntimate = /sad|fear|love|grief|tender|anxious|vulnerable/.test(e);
  const isDynamic  = /anger|action|fight|run|chase|explosive/.test(e);

  if (niche.preferClose || isIntimate) return "medium close-up";
  if (niche.preferWide  || isDynamic)  return "wide shot";
  return "medium shot";
}

// Camera movement — static by default, one motion if required
function emotionToMovement(emotion: string, skeleton: SceneSkeleton, rules: NicheRules): string {
  if (rules.staticDefault) return "static";
  if (skeleton.narrativeRole === "climax") return "slow push in";
  if (skeleton.narrativeRole === "resolution") return "slow pull back";
  const isDynamic = /action|fight|run|chase/.test(skeleton.actionUnit.toLowerCase());
  if (isDynamic) return "tracking shot";
  return "static";
}

function resolveCamera(plan: DirectorPlan, skeleton: SceneSkeleton, niche: Niche, brand?: BrandMemory): CameraSpec {
  const rules = NICHE_RULES[niche];
  let shotSize = emotionToShotSize(skeleton.emotionalState, rules);
  let movement = emotionToMovement(skeleton.emotionalState, skeleton, rules);

  // Brand memory overlay — applied on top of niche rules, below Director overrides
  if (brand) {
    if (brand.cameraStyle.framingBias === "close")  shotSize = "medium close-up";
    if (brand.cameraStyle.framingBias === "wide")   shotSize = "wide shot";
    if (brand.cameraStyle.movementBias === "static") movement = "static";
    if (brand.cameraStyle.movementBias === "slow" && movement === "static") movement = "slow push in";
  }

  const base: CameraSpec = {
    lens:     plan.cameraLanguage.dominantLens,
    shotSize,
    movement,
    dof:      shotSize === "medium close-up" ? "shallow, background blurred" : "moderate depth",
    height:   "eye level",
    framing:  shotSize === "wide shot" ? "environment dominant, subject visible" : "subject dominant, environment secondary",
  };

  // Director per-scene overrides take absolute precedence
  if (skeleton.cameraOverride) {
    return { ...base, ...skeleton.cameraOverride };
  }

  // Narrative-role adjustments — hook always wide to establish
  if (skeleton.narrativeRole === "hook") {
    return { ...base, shotSize: "wide establishing shot", movement: "static" };
  }

  return base;
}

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildImagePrompt(
  skeleton:   SceneSkeleton,
  characters: CharacterSpec[],
  location:   LocationSpec,
  camera:     CameraSpec,
  niche:      Niche,
): string {
  const subject = characters.length > 0
    ? characters.map(c => c.promptFragment?.trim()).filter(Boolean).join(" and ")
    : "unspecified subject";
  const action  = sanitiseAction(skeleton.actionUnit);
  const rules   = NICHE_RULES[niche];

  const lightingHint = rules.lowLight  ? "low ambient light, single directional source"
                     : rules.softLight ? "soft warm natural light, diffused fill"
                     : location.lighting;

  // Structured format — eliminates ambiguity and AI drift
  return [
    `${camera.shotSize}`,
    `subject: ${subject}`,
    `${skeleton.emotionalState} expression, ${action}`,
    `environment: ${location.promptFragment}`,
    lightingHint,
    `${camera.lens} lens, ${camera.dof}`,
    `${camera.framing}`,
    "photorealistic, 9:16 vertical, physically plausible lighting, no text",
  ].filter(Boolean).join(", ");
}

function buildVideoPrompt(
  skeleton:   SceneSkeleton,
  characters: CharacterSpec[],
  location:   LocationSpec,
  camera:     CameraSpec,
  niche:      Niche,
  plan?:      DirectorPlan,
): string {
  const action    = sanitiseAction(skeleton.actionUnit);
  const shotType  = camera.shotSize;
  const cameraMove = camera.movement;

  // charDesc: max 60 chars — first-name + 2 key visual anchors.
  // Runway already has the reference image for identity; the prompt drives MOTION.
  const charDescRaw = characters.length > 1
    ? characters.map(c => {
        const frag = c.promptFragment?.trim() ?? c.name;
        // Extract: name + hair + clothing (first ~60 chars of fragment)
        return frag.slice(0, 60);
      }).join(" and ")
    : (characters[0]?.promptFragment?.trim() ?? `${characters[0]?.name ?? "subject"}`);

  console.info(`[CHARACTER_BIBLE] scene=${skeleton.index + 1} chars=${characters.length} names=[${characters.map(c => c.name).join(",")}] charDesc="${charDescRaw.slice(0, 120)}"`);

  const charDesc = charDescRaw.length > 60 ? charDescRaw.slice(0, 60).trimEnd() : charDescRaw;

  // Environment context from niche — gives Runway a consistent world across all clips
  const nicheKey = plan?.niche ?? "";
  const nicheEnv = getNicheSettings(nicheKey).environmentContext ?? location.environment;

  // Formula: shotType, charDesc, action, environment, cameraMove, cinematic style
  const prompt = [
    shotType,
    charDesc,
    action,
    nicheEnv,
    cameraMove,
    "cinematic 9:16 vertical, golden hour, shallow depth of field, film grain",
  ]
    .filter(Boolean)
    .join(", ")
    .slice(0, 400);

  console.info(`[RUNWAY_PROMPT_BUILT] scene=${skeleton.index + 1} totalChars=${prompt.length} shotType="${shotType}" cameraMove="${cameraMove}" action="${action}" prompt="${prompt}"`);

  return prompt;
}

function buildNegativePrompt(
  skeleton:   SceneSkeleton,
  characters: CharacterSpec[],
): string {
  const char = characters[0];
  const extras: string[] = [...skeleton.forbiddenElements];

  // Forbid clothing variations — enforce locked clothing
  if (char?.clothing) {
    extras.push("different clothing", "costume change", "hat added", "coat removed");
  }

  return [SHARED_NEGATIVE, ...extras].join(", ");
}

// Prevent compound actions slipping through from Director AI
function sanitiseAction(action: string): string {
  // If action contains "and" connecting two verbs, keep only the first clause
  const compoundMatch = action.match(/^(.*?)\s+and\s+/i);
  if (compoundMatch) {
    return compoundMatch[1].trim();
  }
  return action;
}
