// Cinematic Sequencer — Phase 2 Director Mode
//
// Converts a DirectorBrief (script / prompt / idea) into a deterministic
// shot-by-shot SceneSequence with timing, camera, motion, model routing,
// and continuity locks.
//
// Design constraints:
//   - NO retention math, NO virality scoring, NO per-second modeling
//   - Deterministic model selection per scene (Hedra = lipsync, Kling = motion)
//   - Story arc allocation is fixed ratios, not AI-generated
//   - ContinuityState is static per job — no drift across scenes

import { classifyScene } from "./scene-classifier";

// ── Input types ───────────────────────────────────────────────────────────────

export type Platform   = "tiktok" | "reels" | "youtube_shorts" | "youtube" | "generic";
export type Tone       = "professional" | "energetic" | "dramatic" | "casual" | "educational";
export type SceneDensity = "minimal" | "standard" | "rich";

export interface DirectorBrief {
  narrative:           string;        // Full script text or description
  tone:                Tone;
  target_duration_sec: number;        // Desired total video length
  platform:            Platform;
  density:             SceneDensity;  // How many scenes to generate
  character_id?:       string;        // Optional identity anchor for continuity
}

// ── Scene types ───────────────────────────────────────────────────────────────

export type CameraType  = "close" | "medium" | "wide";
export type MotionLevel = "low" | "medium" | "high";
export type ModelHint   = "hedra" | "kling" | "hybrid";
export type StoryBeat   = "hook" | "setup" | "development" | "climax" | "resolution";

export interface Scene {
  id:               string;
  beat:             StoryBeat;
  purpose:          string;
  duration_sec:     number;
  camera_type:      CameraType;
  motion_level:     MotionLevel;
  model:            ModelHint;
  visual_prompt:    string;
  audio_cue:        string;
  continuity_tags:  string[];
}

// ── Continuity state ──────────────────────────────────────────────────────────

export interface ContinuityState {
  character_id:       string;
  outfit_signature:   string;         // Injected into every scene prompt
  lighting_profile:   string;
  environment_seed:   string;
  camera_identity:    string;         // Consistent camera style descriptor
}

// ── Output types ──────────────────────────────────────────────────────────────

export interface CinematicPlan {
  brief:       DirectorBrief;
  scenes:      Scene[];
  continuity:  ContinuityState;
  total_sec:   number;
  scene_count: number;
  model_split: { hedra: number; kling: number; hybrid: number };
}

// ── Story arc allocation (fixed ratios) ──────────────────────────────────────
// Platform-aware pacing. Hook is always first, resolution always last.

const ARC_RATIOS: Record<Platform, Array<{ beat: StoryBeat; weight: number }>> = {
  tiktok:         [{ beat: "hook", weight: 0.12 }, { beat: "setup", weight: 0.18 }, { beat: "development", weight: 0.35 }, { beat: "climax", weight: 0.25 }, { beat: "resolution", weight: 0.10 }],
  reels:          [{ beat: "hook", weight: 0.12 }, { beat: "setup", weight: 0.18 }, { beat: "development", weight: 0.35 }, { beat: "climax", weight: 0.25 }, { beat: "resolution", weight: 0.10 }],
  youtube_shorts: [{ beat: "hook", weight: 0.10 }, { beat: "setup", weight: 0.20 }, { beat: "development", weight: 0.40 }, { beat: "climax", weight: 0.20 }, { beat: "resolution", weight: 0.10 }],
  youtube:        [{ beat: "hook", weight: 0.08 }, { beat: "setup", weight: 0.20 }, { beat: "development", weight: 0.42 }, { beat: "climax", weight: 0.20 }, { beat: "resolution", weight: 0.10 }],
  generic:        [{ beat: "hook", weight: 0.10 }, { beat: "setup", weight: 0.20 }, { beat: "development", weight: 0.40 }, { beat: "climax", weight: 0.20 }, { beat: "resolution", weight: 0.10 }],
};

// ── Scene count by density ────────────────────────────────────────────────────

const SCENE_COUNT: Record<SceneDensity, Record<Platform, number>> = {
  minimal:  { tiktok: 3, reels: 3, youtube_shorts: 4, youtube: 4, generic: 3 },
  standard: { tiktok: 5, reels: 5, youtube_shorts: 6, youtube: 7, generic: 5 },
  rich:     { tiktok: 7, reels: 7, youtube_shorts: 8, youtube: 10, generic: 7 },
};

// ── Camera + motion rules per beat ────────────────────────────────────────────

const BEAT_CAMERA: Record<StoryBeat, CameraType> = {
  hook:        "close",
  setup:       "medium",
  development: "medium",
  climax:      "close",
  resolution:  "wide",
};

const BEAT_MOTION: Record<StoryBeat, MotionLevel> = {
  hook:        "high",
  setup:       "low",
  development: "medium",
  climax:      "high",
  resolution:  "low",
};

// ── Per-scene model selection (deterministic) ─────────────────────────────────
// Rule: lipsync-dominant AND low motion → Hedra
//        otherwise → Kling
//        hybrid only when explicitly needed (not auto-assigned)

function selectModel(beat: StoryBeat, sceneText: string): ModelHint {
  const classification = classifyScene(sceneText);
  // Deterministic: talking head with low motion → Hedra; everything else → Kling
  if (
    (classification.scene_type === "talking_head" || classification.scene_type === "abstract") &&
    classification.motion_complexity < 25
  ) {
    return "hedra";
  }
  return "kling";
}

// ── Narrative split — distributes script text across beats ───────────────────

function splitNarrative(text: string, beats: StoryBeat[]): Record<StoryBeat, string> {
  const sentences = text
    .replace(/([.!?])\s+/g, "$1\n")
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);

  const result = {} as Record<StoryBeat, string>;
  const chunkSize = Math.max(1, Math.ceil(sentences.length / beats.length));

  beats.forEach((beat, i) => {
    const start = i * chunkSize;
    result[beat] = sentences.slice(start, start + chunkSize).join(" ") || text.substring(0, 80);
  });

  return result;
}

// ── Continuity state builder ──────────────────────────────────────────────────

function buildContinuity(brief: DirectorBrief): ContinuityState {
  return {
    character_id:     brief.character_id ?? "primary",
    outfit_signature: "consistent wardrobe — same clothing as first scene",
    lighting_profile: brief.tone === "dramatic"
      ? "high-contrast cinematic lighting, consistent shadows"
      : "natural soft lighting, consistent across all scenes",
    environment_seed: "consistent background environment, no scene transitions unless specified",
    camera_identity:  brief.tone === "energetic"
      ? "dynamic handheld camera feel, consistent throughout"
      : "steady camera, consistent framing",
  };
}

// ── Purpose descriptions per beat ────────────────────────────────────────────

const BEAT_PURPOSE: Record<StoryBeat, string> = {
  hook:        "Capture immediate attention — unresolved action or provocative statement",
  setup:       "Establish context and character — viewer gets grounding",
  development: "Build narrative — demonstrate value or tension",
  climax:      "Peak moment — highest emotion, fastest pacing",
  resolution:  "Payoff and call to action — close the loop",
};

// ── Main sequencer ────────────────────────────────────────────────────────────

export function planCinematicShots(brief: DirectorBrief): CinematicPlan {
  const arcRatios  = ARC_RATIOS[brief.platform];
  const sceneCount = SCENE_COUNT[brief.density][brief.platform];
  const continuity = buildContinuity(brief);

  // Distribute scene count across beats (minimum 1 scene per beat if sceneCount ≥ beats)
  const beatCount  = arcRatios.length;
  const beatsToUse = sceneCount >= beatCount ? arcRatios : arcRatios.slice(0, sceneCount);
  const beatList   = beatsToUse.map(b => b.beat);
  const narrativeMap = splitNarrative(brief.narrative, beatList);

  const scenes: Scene[] = beatsToUse.map((arc, idx) => {
    const beat       = arc.beat;
    const duration   = Math.round(brief.target_duration_sec * arc.weight);
    const sceneText  = narrativeMap[beat] ?? brief.narrative;
    const model      = selectModel(beat, sceneText);
    const camera     = BEAT_CAMERA[beat];
    const motion     = BEAT_MOTION[beat];

    const visualPrompt =
      `${sceneText}, ` +
      `${camera} shot, ${motion} motion, ${brief.tone} tone, ` +
      `${continuity.lighting_profile}, ${continuity.outfit_signature}, ` +
      `single person only, consistent identity across all frames, ` +
      `exactly two arms, exactly two hands, exactly two eyes, stable facial structure, ` +
      `photorealistic, coherent lighting throughout`;

    return {
      id:            `scene_${idx + 1}_${beat}`,
      beat,
      purpose:       BEAT_PURPOSE[beat],
      duration_sec:  Math.max(1, duration),
      camera_type:   camera,
      motion_level:  motion,
      model,
      visual_prompt: visualPrompt,
      audio_cue:     beat === "hook" || beat === "climax" ? "high energy, musical peak" : "ambient, narrative-driven",
      continuity_tags: [
        continuity.character_id,
        continuity.outfit_signature,
        continuity.environment_seed,
      ],
    };
  });

  // Normalize durations to match target (floating point distribution rounding)
  const assignedTotal = scenes.reduce((s, sc) => s + sc.duration_sec, 0);
  const remainder = brief.target_duration_sec - assignedTotal;
  if (remainder !== 0 && scenes.length > 0) {
    scenes[scenes.length - 1].duration_sec = Math.max(1, scenes[scenes.length - 1].duration_sec + remainder);
  }

  const total_sec = scenes.reduce((s, sc) => s + sc.duration_sec, 0);
  const model_split = {
    hedra:  scenes.filter(s => s.model === "hedra").length,
    kling:  scenes.filter(s => s.model === "kling").length,
    hybrid: scenes.filter(s => s.model === "hybrid").length,
  };

  console.info("[cinematic-sequencer] plan generated", {
    platform: brief.platform,
    scenes:   scenes.length,
    total_sec,
    model_split,
  });

  return {
    brief,
    scenes,
    continuity,
    total_sec,
    scene_count: scenes.length,
    model_split,
  };
}
