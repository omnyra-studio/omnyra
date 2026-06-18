// Model Routing Engine
// Scores Seedance vs Hedra against scene classification metrics.
// No manual bypass flags. Score wins.

import { classifyScene, type SceneClassification, type SceneType } from "./scene-classifier";

export type ModelDecision = "seedance" | "hedra";

export interface RoutingResult {
  model:          ModelDecision;
  seedance_score: number;
  hedra_score:    number;
  scene:          SceneClassification;
  reason:         string;
  /** @deprecated Use seedance_score */
  kling_score:    number;
}

// ── Scoring formulas (from spec) ──────────────────────────────────────────────

function seedanceScore(s: SceneClassification): number {
  return Math.round(
    s.motion_complexity      * 0.4 +
    s.environment_complexity * 0.3 +
    s.identity_risk          * 0.3,
  );
}

function hedraScore(s: SceneClassification): number {
  const low_motion_bonus = Math.max(0, 100 - s.motion_complexity);
  return Math.round(
    s.lip_sync_dependency * 0.7 +
    low_motion_bonus      * 0.3,
  );
}

// ── Hard overrides by scene type ──────────────────────────────────────────────
// Score-based routing is the default, but scene_type provides a guardrail
// to prevent obviously wrong selections (e.g. "cinematic" going to Hedra
// because the scene happened to have high lipsync keywords).

const SCENE_TYPE_GUARDRAILS: Record<SceneType, ModelDecision | null> = {
  cinematic:    "seedance",
  abstract:     "hedra",
  talking_head: null,
  mixed_action: null,
};

// ── Main router ───────────────────────────────────────────────────────────────

export function routeModel(description: string): RoutingResult;
export function routeModel(scene: SceneClassification): RoutingResult;
export function routeModel(input: string | SceneClassification): RoutingResult {
  const scene: SceneClassification =
    typeof input === "string" ? classifyScene(input) : input;

  const ss = seedanceScore(scene);
  const hs = hedraScore(scene);

  const guardrail = SCENE_TYPE_GUARDRAILS[scene.scene_type];

  let model: ModelDecision;
  let reason: string;

  if (guardrail) {
    model  = guardrail;
    reason = `scene_type=${scene.scene_type} guardrail forces model=${guardrail}`;
  } else if (ss > hs) {
    model  = "seedance";
    reason = `seedance_score=${ss} > hedra_score=${hs} (motion/env/identity weighted)`;
  } else {
    model  = "hedra";
    reason = `hedra_score=${hs} >= seedance_score=${ss} (lipsync/low-motion weighted)`;
  }

  console.info("[model-router]", {
    scene_type:     scene.scene_type,
    seedance_score: ss,
    hedra_score:    hs,
    model,
    reason,
  });

  return { model, seedance_score: ss, hedra_score: hs, kling_score: ss, scene, reason };
}

// ── Visual consistency constraints (injected into every prompt) ───────────────
// Prevents anatomy hallucinations regardless of model selected.

export const VISUAL_LOCK_CONSTRAINTS = {
  positive: [
    "single person only",
    "consistent identity across all frames",
    "exactly two arms",
    "exactly two hands",
    "exactly two eyes",
    "stable facial structure",
    "photorealistic",
    "coherent lighting throughout",
  ].join(", "),

  negative: [
    "extra limbs",
    "extra hands",
    "extra arms",
    "duplicated body parts",
    "morphing identity",
    "face swap",
    "multiple people",
    "extra fingers beyond five per hand",
    "floating objects",
    "hallucinated props",
    "inconsistent background",
    "scene transition",
    "environment change",
  ].join(", "),
};

export function injectVisualLock(prompt: string, negative?: string): {
  prompt: string;
  negative_prompt: string;
} {
  return {
    prompt:          `${prompt}, ${VISUAL_LOCK_CONSTRAINTS.positive}`,
    negative_prompt: negative
      ? `${negative}, ${VISUAL_LOCK_CONSTRAINTS.negative}`
      : VISUAL_LOCK_CONSTRAINTS.negative,
  };
}
