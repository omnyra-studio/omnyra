// Scene Intelligence Classifier
// Evaluates a scene description BEFORE generation to score complexity,
// identity risk, lipsync dependency, and environment complexity.
// Output drives model routing — no manual bypass flags.

export type SceneType = "talking_head" | "cinematic" | "mixed_action" | "abstract";

export interface SceneClassification {
  scene_type:              SceneType;
  motion_complexity:       number; // 0–100
  identity_risk:           number; // 0–100
  lip_sync_dependency:     number; // 0–100
  environment_complexity:  number; // 0–100
  reasoning:               string;
}

// ── Keyword signal tables ─────────────────────────────────────────────────────

const TALKING_HEAD_SIGNALS = [
  "talking", "speaking", "interview", "portrait", "face", "lip sync",
  "lipsync", "voiceover", "narration", "presenter", "host", "anchor",
  "monologue", "direct address", "static background", "headshot",
  "says", "looking at camera", "direct to camera", "addresses camera",
];

const CINEMATIC_SIGNALS = [
  "cinematic", "action", "running", "walking", "moving", "environment",
  "landscape", "scene", "camera", "pan", "zoom", "dolly", "tracking",
  "outdoor", "indoor", "travel", "dynamic", "motion", "animation",
  "background", "setting", "location", "sweeping", "aerial", "wide shot",
];

const MIXED_ACTION_SIGNALS = [
  "talking while walking", "speaking and moving", "presenter moving",
  "walking interview", "gesture", "hand movement", "pointing",
  "body language", "expressive", "animated presenter",
];

const ABSTRACT_SIGNALS = [
  "abstract", "surreal", "artistic", "stylized", "non-realistic",
  "fantasy", "cartoon", "animated", "illustration", "graphic",
];

const HIGH_MOTION_SIGNALS = [
  "running", "jumping", "action", "fight", "dance", "spin",
  "fast", "quick", "rapid", "dynamic", "explosive",
];

const HIGH_IDENTITY_RISK_SIGNALS = [
  "face replacement", "morph", "transform", "age", "change appearance",
  "multiple people", "crowd", "group", "different person",
];

const HIGH_LIPSYNC_SIGNALS = [
  "lip sync", "lipsync", "talking", "speaking", "voiceover",
  "narration", "dialogue", "words", "speech", "say",
];

const COMPLEX_ENV_SIGNALS = [
  "outdoor", "landscape", "city", "street", "nature", "forest",
  "ocean", "multiple locations", "scene change", "transition",
  "complex background", "busy", "crowded",
];

// ── Scorer helpers ────────────────────────────────────────────────────────────

function countSignals(text: string, signals: string[]): number {
  const lower = text.toLowerCase();
  return signals.filter(s => lower.includes(s)).length;
}

function scoreSignals(text: string, signals: string[], maxSignals = 5): number {
  const hits = countSignals(text, signals);
  return Math.min(100, Math.round((hits / maxSignals) * 100));
}

// ── Main classifier ───────────────────────────────────────────────────────────

export function classifyScene(description: string): SceneClassification {
  const lower = description.toLowerCase();

  const talkingHitCount  = countSignals(lower, TALKING_HEAD_SIGNALS);
  const cinematicCount   = countSignals(lower, CINEMATIC_SIGNALS);
  const mixedCount       = countSignals(lower, MIXED_ACTION_SIGNALS);
  const abstractCount    = countSignals(lower, ABSTRACT_SIGNALS);

  // Determine scene_type by dominant signal category
  let scene_type: SceneType;
  const maxCount = Math.max(talkingHitCount, cinematicCount, mixedCount, abstractCount);

  if (mixedCount > 0 && (talkingHitCount > 0 || cinematicCount > 0)) {
    scene_type = "mixed_action";
  } else if (maxCount === 0 || abstractCount === maxCount) {
    scene_type = abstractCount > 0 ? "abstract" : "talking_head";
  } else if (cinematicCount === maxCount) {
    scene_type = "cinematic";
  } else if (talkingHitCount === maxCount) {
    scene_type = "talking_head";
  } else {
    scene_type = "talking_head"; // safest default
  }

  const motion_complexity      = scoreSignals(lower, HIGH_MOTION_SIGNALS, 4);
  const identity_risk          = scoreSignals(lower, HIGH_IDENTITY_RISK_SIGNALS, 3);
  const lip_sync_dependency    = scoreSignals(lower, HIGH_LIPSYNC_SIGNALS, 5);
  const environment_complexity = scoreSignals(lower, COMPLEX_ENV_SIGNALS, 5);

  // Boost motion complexity for cinematic/mixed scenes
  const motionBoosted = scene_type === "cinematic"
    ? Math.min(100, motion_complexity + 30)
    : scene_type === "mixed_action"
      ? Math.min(100, motion_complexity + 15)
      : motion_complexity;

  // Boost lipsync for talking_head
  const lipsyncBoosted = scene_type === "talking_head"
    ? Math.min(100, lip_sync_dependency + 40)
    : lip_sync_dependency;

  const reasoning =
    `scene_type=${scene_type} ` +
    `talking_signals=${talkingHitCount} cinematic_signals=${cinematicCount} ` +
    `mixed_signals=${mixedCount} motion=${motionBoosted} lipsync=${lipsyncBoosted}`;

  return {
    scene_type,
    motion_complexity:      motionBoosted,
    identity_risk,
    lip_sync_dependency:    lipsyncBoosted,
    environment_complexity,
    reasoning,
  };
}
