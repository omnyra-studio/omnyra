/**
 * Director AI — Layer 1
 *
 * Creates a LOCKED DirectorPlan + SceneSkeletons before any generation.
 * SceneSkeletons define what each scene IS (action, entities, camera intent).
 * They do NOT contain timing — that is the Voice Engine's domain.
 *
 * Nothing downstream may rewrite or contradict the Director's output.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  DirectorPlan,
  SceneSkeleton,
  CharacterSpec,
  LocationSpec,
  CameraSpec,
  NarrativeRole,
  TransitionType,
  MotionClass,
  RetentionRole,
} from "./types";

const client = new Anthropic();

export interface DirectorOutput {
  plan:      DirectorPlan;
  skeletons: SceneSkeleton[];
}

// ── Three-layer prompt architecture ───────────────────────────────────────────
//
//   SYSTEM  — immutable guardrails (pipeline cannot be reordered, invalid outputs rejected)
//   DEVELOPER — pipeline contract (SceneSpec schema, rules — stable, changes only on product pivot)
//   WORKER  — runtime execution (current job only, no architecture definitions)
//
// This separation prevents prompt drift, scene-level architecture redefinition,
// and inconsistent constraint application across generation runs.

const SYSTEM_PROMPT = `You are the Director AI for Omnyra Studio, a deterministic cinematic compiler.

EXECUTION CONTRACT (absolute — never violate):
- VOICE IS TIME. ElevenLabs voice duration defines the timeline. You do not.
- SCENE DURATION IS LOCKED by voice timestamps — you have no authority over timing.
- SINGLE SOURCE OF TRUTH: script → voice → timeline → SceneContracts → render.
  Nothing downstream may redefine what you define. Nothing upstream may be overridden.
- You only define: characters, locations, camera language, and per-scene visual intent.
- You do NOT define: durations, audio, video provider settings, or assembly order.
- If your output would affect timing or voice: stop and omit that field.

ABSOLUTE CONSTRAINTS (never violate):
- Never redefine SceneSpec, SceneContract, or pipeline structure in your output.
- Never allow scene-level creativity to override global DirectorPlan constraints.
- Never change characters, clothing, or locations once defined.
- Never use compound actions (one action per scene only).
- Never invent characters or props not present in the script.
- Never output anything except valid JSON.
- If output would violate any constraint: stop and return minimal valid JSON instead.`;

const DEVELOPER_PROMPT = `## PIPELINE CONTRACT

### SceneSpec (single source of truth per scene)
Each scene spec must contain:
- characters: characterIndices — set ONLY the indices of characters who PHYSICALLY APPEAR in this specific scene. This MUST vary across skeletons. If only character B (index 1) appears in a scene: [1]. If only character A (index 0): [0]. If both: [0, 1]. NEVER default all scenes to [0] when multiple characters exist.
- actionUnit: ONE action only, completable in 5-10s
- emotionalState: single dominant word
- requiredProps: tracked state (props persist across scenes)
- locationIndex: fixed reference into DirectorPlan locations
- camera: explicit (lens + shotSize + movement + height) — never "cinematic"

### DirectorPlan (immutable global)
- character clothing is LOCKED — same exact garment every scene
- full coverage clothing ONLY — no bare shoulders, strapless, low-cut, off-shoulder
- camera language applies identically to ALL scenes
- emotional arc defines the narrative shape

### Validation constraints baked into output
- forbiddenElements MUST include: "other people", "text or signs", "bare skin", "nsfw"
- promptFragment MUST be 30-40 words verbatim (for exact injection into image prompts)
- narrationBeat distribution MUST cover entire script — no words dropped
- imagePrompt MUST include character promptFragment verbatim
- videoPrompt MUST describe ONE motion + camera + character name only

### Output schema
Return ONLY this JSON structure. No markdown, no explanation:
{
  "plan": {
    "title": "string",
    "logline": "string — one sentence",
    "emotionalArc": "string — journey from first to last scene",
    "cameraLanguage": {
      "dominantLens": "string — e.g. 50mm",
      "colorGrade": "string — e.g. teal-orange film grade",
      "lightingApproach": "string — e.g. natural window light, soft fill",
      "motionStyle": "string — e.g. slow push-ins, locked-off statics"
    },
    "characters": [{
      "name": "string",
      "age": "string — e.g. woman in her early 30s",
      "sex": "string",
      "hair": "string — exact color, length, style",
      "eyes": "string — color",
      "skinTone": "string",
      "clothing": "string — EXACT locked clothing — e.g. oversized cream knit sweater, dark jeans, white sneakers",
      "accessories": "string — none OR exact items",
      "facialFeatures": "string",
      "bodyType": "string",
      "promptFragment": "string — 30-40 words verbatim — e.g. woman early 30s wavy auburn hair green eyes fair skin cream knit sweater dark jeans white sneakers soft jaw"
    }],
    "locations": [{
      "name": "string",
      "environment": "string",
      "lighting": "string — SPECIFIC — e.g. warm golden hour side-light through large window, soft orange cast",
      "weather": "string",
      "timeOfDay": "string",
      "colors": "string — dominant palette",
      "promptFragment": "string — 20-30 words verbatim"
    }]
  },
  "skeletons": [{
    "index": 0,
    "narrativeRole": "hook",
    "narrationBeat": "string — exact verbatim words from script for this scene",
    "actionUnit": "string — ONE action 5-10 words — e.g. walks three steps to kitchen window",
    "emotionalState": "string — single word",
    "characterIndices": [0],
    "locationIndex": 0,
    "requiredProps": ["string"],
    "forbiddenElements": ["other people", "text or signs", "bare skin", "nsfw"],
    "cameraOverride": null,
    "transitionOut": "cut",
    "shotType": "wide",
    "cameraMove": "slow push in"
  }]
}

### shotType rules (required on every skeleton)
Valid values: "wide", "medium", "close-up", "extreme close-up"
A 3-scene plan MUST use at least 2 different shotTypes. A common progression: scene 1 = "wide", scene 2 = "medium", scene 3 = "close-up". Never assign the same shotType to every scene.

### cameraMove rules (required on every skeleton)
Valid values: "slow push in", "tracking left", "tracking right", "slow pull back", "handheld drift", "low angle rise", "orbit right", "static hold with subject motion"
Choose the move that best matches the scene action and emotionalState. Never repeat the same cameraMove across all scenes.

### characterIndices rules
- characterIndices references plan.characters by array index (0-based)
- Single-character scene: [0]
- Multi-character scene (couple / two people together): [0, 1]
- If a scene features the second character alone: [1]
- NEVER leave characterIndices as [0] for every scene when the script involves two people interacting — distribute them correctly across scenes`;

const NICHE_DIRECTOR_RULES: Record<string, string> = {
  horror:  "slow camera only, max 2 characters per scene, minimal props, imply threat through framing not description, prefer close and medium shots",
  romance: "close shots on faces and hands, static or slow push only, soft warm lighting in locations, no crowded scenes",
  action:  "wide shots for spatial clarity, one decisive motion per scene, strong subject-environment separation, no visual clutter",
  drama:   "medium and close shots, slow pacing, minimal camera movement, strong single emotional focus per scene",
  comedy:  "clean readable framing, medium shots preferred, simple unambiguous single action per scene",
  neutral: "medium shots default, static camera unless action requires movement",
};

function detectNicheKey(niche: string): string {
  const n = niche.toLowerCase();
  if (/horror|scary|dark|haunt|fear/.test(n))     return "horror";
  if (/romance|love|kiss|relationship/.test(n))   return "romance";
  if (/action|fight|chase|battle/.test(n))        return "action";
  if (/drama|sad|loss|death|goodbye/.test(n))     return "drama";
  if (/comedy|funny|joke|prank/.test(n))          return "comedy";
  return "neutral";
}

function buildWorkerPrompt(
  script: string,
  niche: string,
  sceneCount: number,
  targetDuration: 30 | 60 | 90,
  referenceImageUrl?: string,
): string {
  const roles: NarrativeRole[] = ["hook", "development", "development", "climax", "climax", "resolution", "resolution", "resolution", "resolution"];
  const roleAssignment = roles.slice(0, sceneCount).join(", ");
  const nicheKey = detectNicheKey(niche);
  const nicheRules = NICHE_DIRECTOR_RULES[nicheKey];
  const maxNarrationSec = targetDuration - 2;
  const secPerScene = Math.round(targetDuration / sceneCount);
  const wordsPerScene = Math.round(secPerScene * 2.5);

  return `Generate a DirectorPlan and ${sceneCount} scene specs for this production job.

SCRIPT:
"""
${script}
"""

NICHE: ${niche}
GENRE RULES: ${nicheRules}
SCENE COUNT: ${sceneCount}
NARRATIVE ROLES (in order): ${roleAssignment}
${referenceImageUrl ? `REFERENCE IMAGE: The image provided above shows the actual character(s). Match all appearance attributes (face, hair, skin tone, build) exactly to what you see. Do NOT invent or alter any character attributes.` : ""}

NARRATION TIMING RULES (non-negotiable):
- Target video duration: ${targetDuration}s
- Maximum total narration: ${maxNarrationSec}s of spoken audio
- Each scene gets approximately ${secPerScene}s
- Word budget per scene: ${wordsPerScene} words MAX
- Total narration across ALL scenes must fill approximately ${targetDuration}s at natural speaking pace (~2.5 words/second = ~${Math.round(targetDuration * 2.5)} total words). Do not undershoot the time budget.
- Write SHORT per scene. Punchy. One thought. Never pad individual beats.
- If in doubt, cut the last sentence.

RETENTION STRUCTURE (viral pacing — short-form optimized):
- Scene 1 = HOOK: emotionally loaded, visually simple, readable in <2 seconds
- Middle early scenes = CONTEXT: establish and build
- Middle late scenes = ESCALATION: momentum increase, visual energy rises
- Final scene = PAYOFF: emotional resolution, satisfying visual close

STRICT EXECUTION RULES:
- Each scene = exactly 1 irreversible narrative event
- No compressed multi-action beats
- No invented characters or props not in script
- camera.movement must be "static" unless action explicitly requires motion
- emotionalState must be a single dominant word — no blending
- actionUnit must be a single verb clause — no "and" compounds

CHARACTER SCENE ASSIGNMENT (mandatory — most common pipeline failure):
- Before writing skeletons, count how many distinct characters the script mentions by name or role.
- If the script has 2 or more characters, they MUST be listed as separate objects in plan.characters.
- For EACH skeleton, set characterIndices to ONLY the indices of the characters who appear in that specific scene.
- Example: script has Person A (index 0) and Person B (index 1). Scene 1 shows only A → [0]. Scene 3 shows only B → [1]. Scene 5 shows both → [0, 1].
- If you write [0] for every skeleton despite having 2 characters defined: that is a critical bug. Every scene will render with the wrong person.
- If the script has only one character, all skeletons may use [0]. Otherwise they MUST differ where appropriate.

Follow the pipeline contract exactly. Return only valid JSON.`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runDirectorAI(
  script:             string,
  voiceId:            string,
  niche:              string,
  targetDuration:     30 | 60 | 90,
  referenceImageUrl?: string,
): Promise<DirectorOutput> {
  const sceneCount = targetDuration === 30 ? 3 : targetDuration === 60 ? 6 : 9;

  console.log(`[DIRECTOR] planning ${sceneCount} scenes for ${targetDuration}s niche=${niche}`);

  // Three-layer prompt: SYSTEM (guardrails) + DEVELOPER (pipeline contract) + WORKER (this job)
  const workerText = buildWorkerPrompt(script, niche, sceneCount, targetDuration, referenceImageUrl);
  const userContent = referenceImageUrl
    ? [
        { type: "image" as const, source: { type: "url" as const, url: referenceImageUrl } },
        { type: "text"  as const, text:   workerText },
      ]
    : workerText;

  const systemContent = `${SYSTEM_PROMPT}\n\n${DEVELOPER_PROMPT}`;
  let raw = "";
  let parsed: { plan: Record<string, unknown>; skeletons: Record<string, unknown>[] } | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    // Attempt 2 uses multi-turn: previous bad response + correction request
    type MsgParam = { role: "user" | "assistant"; content: typeof userContent | string };
    const messages: MsgParam[] = attempt === 1
      ? [{ role: "user", content: userContent }]
      : [
          { role: "user",      content: workerText },
          { role: "assistant", content: raw },
          { role: "user",      content: "Your previous response contained invalid JSON. Return ONLY a valid JSON object. No trailing commas after the last element in any array or object. No comments. No markdown fences. No text before or after the JSON." },
        ];

    const response = await client.messages.create({
      model:      "claude-opus-4-8",
      max_tokens: 8000,
      system:     systemContent,
      messages:   messages as Parameters<typeof client.messages.create>[0]["messages"],
    });

    raw = response.content[0]?.type === "text" ? response.content[0].text : "";

    // Extract JSON block
    const jsonStart = raw.indexOf("{");
    const jsonEnd   = raw.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      console.error(`[DIRECTOR] attempt=${attempt} no JSON found. Raw:`, raw.slice(0, 500));
      if (attempt === 2) throw new Error("Scene planning failed — please retry your request");
      continue;
    }

    // Repair common LLM JSON mistakes (trailing commas) then parse
    const jsonStr = repairJson(raw.slice(jsonStart, jsonEnd + 1));
    try {
      parsed = JSON.parse(jsonStr) as { plan: Record<string, unknown>; skeletons: Record<string, unknown>[] };
    } catch (e) {
      console.error(`[DIRECTOR] attempt=${attempt} JSON parse failed: ${(e as Error).message}`);
      console.error("[DIRECTOR] Full raw output:", raw.slice(0, 3000));
      if (attempt === 2) throw new Error("Scene planning failed — please retry your request");
      continue;
    }

    // Schema validation — missing fields = treat as corrupt and retry
    if (!validateDirectorOutput(parsed, sceneCount)) {
      console.error(`[DIRECTOR] attempt=${attempt} schema validation failed — missing required fields`);
      if (attempt === 2) throw new Error("Scene planning failed — please retry your request");
      parsed = null;
      continue;
    }

    console.log(`[DIRECTOR] attempt=${attempt} JSON parsed and validated OK`);
    break;
  }

  if (!parsed) throw new Error("Scene planning failed — please retry your request");

  const plan           = assemblePlan(parsed.plan, voiceId, niche, sceneCount);
  const characterNames = plan.characters.map(c => c.name);
  const skeletons      = assembleSkeletons(parsed.skeletons, sceneCount, characterNames);

  console.log(`[DIRECTOR] plan="${plan.title}" characters=${plan.characters.length} locations=${plan.locations.length} skeletons=${skeletons.length}`);
  return { plan, skeletons };
}

// ── JSON repair + validation ──────────────────────────────────────────────────

function repairJson(raw: string): string {
  // Remove trailing commas before ] or } — the most common LLM mistake
  return raw.replace(/,(\s*[}\]])/g, '$1');
}

function validateDirectorOutput(
  parsed: { plan: Record<string, unknown>; skeletons: Record<string, unknown>[] },
  expectedSceneCount: number,
): boolean {
  if (!parsed.plan || typeof parsed.plan !== "object") return false;
  const plan = parsed.plan as Record<string, unknown>;
  if (!plan.title)                                   return false;
  if (!Array.isArray(plan.characters))               return false;
  if (!Array.isArray(plan.locations))                return false;
  if (!Array.isArray(parsed.skeletons) || parsed.skeletons.length === 0) return false;

  for (const s of parsed.skeletons as Record<string, unknown>[]) {
    if (typeof s.index !== "number")        return false;
    if (!s.narrativeRole)                   return false;
    if (!s.actionUnit)                      return false;
    if (!Array.isArray(s.characterIndices)) return false;
  }
  return true;
}

// ── Assemblers ────────────────────────────────────────────────────────────────

function assemblePlan(
  raw: Record<string, unknown>,
  voiceId: string,
  niche:   string,
  sceneCount: number,
): DirectorPlan {
  const rawCam  = (raw.cameraLanguage as Record<string, string>) ?? {};
  const chars   = (raw.characters as Record<string, string>[]) ?? [];
  const locs    = (raw.locations  as Record<string, string>[]) ?? [];

  return {
    title:        String(raw.title       ?? "Untitled"),
    logline:      String(raw.logline     ?? ""),
    emotionalArc: String(raw.emotionalArc ?? ""),
    cameraLanguage: {
      dominantLens:     String(rawCam.dominantLens     ?? "50mm"),
      colorGrade:       String(rawCam.colorGrade       ?? "teal-orange film grade"),
      lightingApproach: String(rawCam.lightingApproach ?? "natural light"),
      motionStyle:      String(rawCam.motionStyle      ?? "slow push-ins"),
    },
    characters: chars.map(c => ({
      name:           String(c.name           ?? "Character"),
      age:            String(c.age            ?? ""),
      sex:            String(c.sex            ?? ""),
      hair:           String(c.hair           ?? ""),
      eyes:           String(c.eyes           ?? ""),
      skinTone:       String(c.skinTone       ?? ""),
      clothing:       String(c.clothing       ?? ""),
      accessories:    String(c.accessories    ?? "none"),
      facialFeatures: String(c.facialFeatures ?? ""),
      bodyType:       String(c.bodyType       ?? ""),
      promptFragment: String(c.promptFragment ?? ""),
    } as CharacterSpec)),
    locations: locs.map(l => ({
      name:           String(l.name           ?? ""),
      environment:    String(l.environment    ?? ""),
      lighting:       String(l.lighting       ?? ""),
      weather:        String(l.weather        ?? ""),
      timeOfDay:      String(l.timeOfDay      ?? ""),
      colors:         String(l.colors         ?? ""),
      promptFragment: String(l.promptFragment ?? ""),
    } as LocationSpec)),
    voiceId,
    niche,
    sceneCount,
  };
}

// Normalise Director output to canonical shotType/cameraMove values.
// Fuzzy: "close up" → "close-up", "push in" → "slow push in", etc.
// Never throws — returns a sensible default if nothing matches.
function normaliseShotType(raw: string): string {
  const v = raw.toLowerCase().trim();
  if (v.includes("extreme") || v.includes("ecу") || v.includes("ecu")) return "extreme close-up";
  if (v.includes("close"))    return "close-up";
  if (v.includes("wide") || v.includes("establishing")) return "wide";
  if (v.includes("medium") || v.includes("mid"))        return "medium";
  return "medium"; // safe default
}

function normaliseCameraMove(raw: string): string {
  const v = raw.toLowerCase().trim();
  if ((v.includes("push") && v.includes("in")) || v.includes("dolly in") || v.includes("zoom in"))  return "slow push in";
  if ((v.includes("pull") && v.includes("back")) || v.includes("dolly out") || v.includes("zoom out")) return "slow pull back";
  if (v.includes("track") && (v.includes("left") || v.includes("l")))  return "tracking left";
  if (v.includes("track") && (v.includes("right") || v.includes("r"))) return "tracking right";
  if (v.includes("orbit") || v.includes("arc"))    return "orbit right";
  if (v.includes("handheld") || v.includes("drift") || v.includes("shaky")) return "handheld drift";
  if (v.includes("rise") || v.includes("crane") || v.includes("low angle")) return "low angle rise";
  if (v.includes("static") || v.includes("locked") || v.includes("still"))  return "static hold with subject motion";
  return "slow push in"; // safe cinematic default
}

function assembleSkeletons(
  raws:           Record<string, unknown>[],
  expectedCount:  number,
  characterNames: string[] = [],
): SceneSkeleton[] {
  if (!Array.isArray(raws) || raws.length === 0) {
    throw new Error(`Director returned 0 skeletons (expected ${expectedCount})`);
  }

  const roles: NarrativeRole[] = ["hook", "development", "development", "climax", "climax", "resolution", "resolution", "resolution", "resolution"];

  const motionByRole: Record<NarrativeRole, MotionClass> = {
    hook:        "cinematic",
    development: "cinematic",
    climax:      "fast",
    resolution:  "standard",
  };

  const retentionRole = (i: number, total: number): RetentionRole => {
    if (i === 0)            return "hook";
    if (i === total - 1)    return "payoff";
    const mid = Math.floor(total / 2);
    return i < mid ? "context" : "escalation";
  };

  const skeletons: SceneSkeleton[] = raws.slice(0, expectedCount).map((s, i) => {
    const role = (s.narrativeRole as NarrativeRole) ?? roles[i] ?? "development";
    return {
      index:             i,
      narrativeRole:     role,
      retentionRole:     retentionRole(i, expectedCount),
      narrationBeat:     String(s.narrationBeat  ?? ""),
      actionUnit:        String(s.actionUnit     ?? ""),
      emotionalState:    String(s.emotionalState ?? "neutral"),
      motion:            motionByRole[role] ?? "cinematic",
      characterIndices:  Array.isArray(s.characterIndices) ? (s.characterIndices as number[]) : [0],
      locationIndex:     typeof s.locationIndex === "number" ? s.locationIndex : 0,
      requiredProps:     Array.isArray(s.requiredProps) ? (s.requiredProps as string[]) : [],
      forbiddenElements: Array.isArray(s.forbiddenElements)
        ? (s.forbiddenElements as string[])
        : ["other people", "text or signs", "bare skin", "nsfw"],
      cameraOverride:    {
        ...(s.cameraOverride as Partial<CameraSpec> | null ?? {}),
        ...(s.shotType   ? { shotSize: normaliseShotType(String(s.shotType))   } : {}),
        ...(s.cameraMove ? { movement: normaliseCameraMove(String(s.cameraMove)) } : {}),
      },
      transitionOut:     (s.transitionOut as TransitionType) ?? "cut",
    };
  });

  // Bug 4 fix: if Director gave [0] to every scene despite multiple characters,
  // try to reassign indices by matching character names in each scene's narration text.
  if (characterNames.length > 1) {
    const allUseIndex0 = skeletons.every(
      s => s.characterIndices.length === 1 && s.characterIndices[0] === 0,
    );

    if (allUseIndex0) {
      console.warn(
        `[CHARACTER_BIBLE_WARN] Director assigned characterIndices=[0] to every scene ` +
        `but ${characterNames.length} characters defined (${characterNames.join(", ")}) — ` +
        `attempting name-based reassignment`,
      );
      const nameLower = characterNames.map(n => n.toLowerCase());
      for (const skeleton of skeletons) {
        const text = skeleton.narrationBeat.toLowerCase();
        const mentioned = nameLower
          .map((n, idx) => ({ idx, hit: text.includes(n) }))
          .filter(x => x.hit)
          .map(x => x.idx);

        if (mentioned.length >= 2) {
          skeleton.characterIndices = mentioned; // both characters present in this scene
        } else if (mentioned.length === 1) {
          skeleton.characterIndices = mentioned; // only one character mentioned
        } else {
          // No name found — for 2-character scripts default to couple (both present)
          skeleton.characterIndices = characterNames.length === 2 ? [0, 1] : [0];
        }
      }
    }
  }

  // Enforce shot variety — if Director gave every scene the same shotType, override
  // with the cinematic wide→medium→close-up progression. Never retriggers AI.
  if (skeletons.length >= 3) {
    const PROGRESSION: string[] = ["wide", "medium", "close-up"];
    const shotSizes = skeletons.map(s => s.cameraOverride?.shotSize ?? "medium");
    const unique = new Set(shotSizes);
    if (unique.size === 1) {
      console.warn(`[CAMERA_VARIETY] All scenes have shotType="${[...unique][0]}" — forcing wide→medium→close-up progression`);
      skeletons.forEach((sk, i) => {
        sk.cameraOverride = {
          ...sk.cameraOverride,
          shotSize: PROGRESSION[Math.min(i, PROGRESSION.length - 1)],
        };
      });
    }
  }

  // Per-scene character bible log — visible in Vercel logs after every Director run
  for (const skeleton of skeletons) {
    const chars = skeleton.characterIndices
      .map(idx => characterNames[idx] ?? `char${idx}`)
      .join(", ");
    console.log(
      `[CHARACTER_BIBLE] scene=${skeleton.index + 1} ` +
      `indices=[${skeleton.characterIndices.join(",")}] ` +
      `characters="${chars}"`,
    );
  }

  return skeletons;
}
