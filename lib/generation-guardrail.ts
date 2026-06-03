// Generation Time Guardrail — 4-minute hard cap on total pipeline runtime.
// Runs before execution. If estimated runtime exceeds 240s, applies automatic
// reduction strategy until the estimate fits or the request is rejected.

export const HARD_CAP_SECONDS = 240;

// ── Cost estimates ────────────────────────────────────────────────────────────

const SECONDS_PER_CLIP: Record<string, number> = {
  kling_hq: 55,
  kling_standard: 40,
  smart_motion: 8,
  fal_flux: 5,
};

const SECONDS_PER_VALIDATION_PASS = 3;
const OVERHEAD_SECONDS = 10; // auth, DB reads, upload

// ── Types ─────────────────────────────────────────────────────────────────────

export type ModelTier = "kling_hq" | "kling_standard" | "smart_motion" | "fal_flux";

export interface GuardrailInput {
  sceneCount: number;
  modelTier: ModelTier;
  frameCount?: number;         // frames per scene (unused currently, reserved)
  validationPasses?: number;   // how many Zero-Critic passes planned
}

export interface GuardrailResult {
  approved: boolean;
  estimatedRuntimeSeconds: number;
  appliedOptimizations: string[];
  finalSceneCount: number;
  finalModelTier: ModelTier;
  finalValidationPasses: number;
  reason: string;
}

// ── Estimator ─────────────────────────────────────────────────────────────────

function estimateRuntime(
  sceneCount: number,
  modelTier: ModelTier,
  validationPasses: number,
): number {
  const clipSeconds = (SECONDS_PER_CLIP[modelTier] ?? 40) * sceneCount;
  const validationSeconds = SECONDS_PER_VALIDATION_PASS * validationPasses * sceneCount;
  return clipSeconds + validationSeconds + OVERHEAD_SECONDS;
}

// ── Tier downgrade chain ──────────────────────────────────────────────────────

const DOWNGRADE_CHAIN: ModelTier[] = ["kling_hq", "kling_standard", "smart_motion", "fal_flux"];

function downgradeTier(tier: ModelTier): ModelTier | null {
  const idx = DOWNGRADE_CHAIN.indexOf(tier);
  return idx >= 0 && idx < DOWNGRADE_CHAIN.length - 1
    ? DOWNGRADE_CHAIN[idx + 1]!
    : null;
}

// ── Main guardrail ────────────────────────────────────────────────────────────

export function applyGenerationGuardrail(input: GuardrailInput): GuardrailResult {
  let sceneCount = Math.max(1, input.sceneCount);
  let modelTier = input.modelTier;
  let validationPasses = input.validationPasses ?? 1;
  const optimizations: string[] = [];

  let estimated = estimateRuntime(sceneCount, modelTier, validationPasses);

  // Pass 1 — reduce validation passes to 0
  if (estimated > HARD_CAP_SECONDS && validationPasses > 0) {
    validationPasses = 0;
    optimizations.push("skipped_validation_passes");
    estimated = estimateRuntime(sceneCount, modelTier, validationPasses);
  }

  // Pass 2 — downgrade model tier
  if (estimated > HARD_CAP_SECONDS) {
    const downgraded = downgradeTier(modelTier);
    if (downgraded) {
      optimizations.push(`model_tier_downgraded:${modelTier}→${downgraded}`);
      modelTier = downgraded;
      estimated = estimateRuntime(sceneCount, modelTier, validationPasses);
    }
  }

  // Pass 3 — reduce scene count (step down by 1 until it fits or reaches 1)
  while (estimated > HARD_CAP_SECONDS && sceneCount > 1) {
    sceneCount--;
    optimizations.push(`scene_count_reduced:${sceneCount + 1}→${sceneCount}`);
    estimated = estimateRuntime(sceneCount, modelTier, validationPasses);
  }

  const approved = estimated <= HARD_CAP_SECONDS;

  return {
    approved,
    estimatedRuntimeSeconds: estimated,
    appliedOptimizations: optimizations,
    finalSceneCount: sceneCount,
    finalModelTier: modelTier,
    finalValidationPasses: validationPasses,
    reason: approved
      ? `Approved: estimated ${estimated}s within ${HARD_CAP_SECONDS}s cap.`
      : `Rejected: cannot fit within ${HARD_CAP_SECONDS}s even at minimum config (estimated ${estimated}s).`,
  };
}
