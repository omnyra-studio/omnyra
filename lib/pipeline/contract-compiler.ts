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
} from "./types";

const SHARED_NEGATIVE =
  "blur, low quality, watermark, text overlay, written words, legible text, " +
  "extra limbs, extra fingers, mutated hands, deformed anatomy, body horror, " +
  "nude, naked, topless, bare shoulders, strapless, off-shoulder, low-cut, cleavage, " +
  "revealing clothing, nsfw, sexual, explicit, " +
  "unstable motion, chaotic jitter, back of head only";

// ── Main export ───────────────────────────────────────────────────────────────

export function compileContracts(
  plan:      DirectorPlan,
  skeletons: SceneSkeleton[],
  timings:   VoiceTiming[],
): SceneContract[] {
  if (skeletons.length !== timings.length) {
    throw new Error(
      `Contract compile error: ${skeletons.length} skeletons vs ${timings.length} timings`
    );
  }

  return skeletons.map((skeleton, i) => compileOne(plan, skeleton, timings[i]));
}

// ── Single contract compilation ───────────────────────────────────────────────

function compileOne(
  plan:     DirectorPlan,
  skeleton: SceneSkeleton,
  timing:   VoiceTiming,
): SceneContract {
  // Resolve entity references
  const characters = resolveCharacters(plan, skeleton.characterIndices);
  const location   = resolveLocation(plan, skeleton.locationIndex);

  // Merge plan-level camera with any per-scene overrides
  const camera = resolveCamera(plan, skeleton);

  // Clip duration: round up voice duration to nearest 5s boundary, min 5s, max 10s
  const voiceSec      = timing.durationMs / 1000;
  const clipDurationSec = voiceSec <= 5 ? 5 : 10;

  // Build locked prompts from compiled data
  const imagePrompt   = buildImagePrompt(skeleton, characters, location, camera);
  const videoPrompt   = buildVideoPrompt(skeleton, characters, location, camera);
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

function resolveCamera(plan: DirectorPlan, skeleton: SceneSkeleton): CameraSpec {
  const base: CameraSpec = {
    lens:      plan.cameraLanguage.dominantLens,
    shotSize:  "medium shot",
    movement:  plan.cameraLanguage.motionStyle.split(",")[0].trim(),
    dof:       "shallow, background softly blurred",
    height:    "eye level",
    framing:   "subject centered, slight headroom",
  };

  // Apply per-scene overrides if Director specified them
  if (skeleton.cameraOverride) {
    return { ...base, ...skeleton.cameraOverride };
  }

  // Apply narrative-role heuristics when no override
  switch (skeleton.narrativeRole) {
    case "hook":
      return { ...base, shotSize: "wide establishing shot", movement: "static" };
    case "climax":
      return { ...base, shotSize: "close-up", movement: "slow push in", dof: "very shallow" };
    case "resolution":
      return { ...base, shotSize: "medium shot", movement: "slow pull back" };
    default:
      return base;
  }
}

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildImagePrompt(
  skeleton:   SceneSkeleton,
  characters: CharacterSpec[],
  location:   LocationSpec,
  camera:     CameraSpec,
): string {
  const char = characters[0];
  if (!char) return `${camera.shotSize}, ${location.promptFragment}, photorealistic, 9:16 vertical`;

  const parts = [
    `${camera.shotSize}`,
    char.promptFragment,                        // VERBATIM from CharacterBible
    skeleton.emotionalState + " expression",
    location.promptFragment,                    // VERBATIM from LocationBible
    camera.dof,
    `${camera.lens} lens`,
    "photorealistic, 9:16 vertical",
    "no text, no watermark",
  ];

  return parts.filter(Boolean).join(", ");
}

function buildVideoPrompt(
  skeleton:   SceneSkeleton,
  characters: CharacterSpec[],
  location:   LocationSpec,
  camera:     CameraSpec,
): string {
  const char = characters[0];
  const name = char?.name ?? "subject";

  // ONE action only — this is enforced by the Director schema but we sanitise here too
  const action = sanitiseAction(skeleton.actionUnit);

  const parts = [
    `${name} ${action}`,
    `${camera.shotSize} ${camera.lens} lens`,
    camera.movement,
    location.lighting ?? location.promptFragment,
    skeleton.emotionalState,
  ];

  return parts.filter(Boolean).join(", ").slice(0, 400);
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
