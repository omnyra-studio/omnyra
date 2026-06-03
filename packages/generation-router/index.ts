// Generation Router — provider abstraction layer.
// Kling / FLUX / Runway / smart_motion behind a unified interface.
// All model calls MUST go through this router. Never from UI directly.

export type Provider = "kling" | "flux" | "runway" | "smart_motion";
export type ModelTier = "pro" | "turbo" | "fast";
export type AspectRatio = "9:16" | "16:9" | "1:1" | "4:5";

export interface GenerationRequest {
  jobId: string;
  sceneIndex: number;
  compiledPrompt: string;
  provider: Provider;
  modelTier?: ModelTier;
  sourceImageUrl?: string | null;
  durationSeconds: 5 | 10;
  aspectRatio?: AspectRatio;
}

export interface GenerationResult {
  jobId: string;
  sceneIndex: number;
  outputUrl: string;
  provider: Provider;
  model: string;
  latencyMs: number;
  costUnits: number;
}

// Scene type → provider routing rules
const SMART_MOTION_TYPES = new Set(["quote", "educational", "cta", "background", "transition"]);
const KLING_TYPES = new Set(["talking_head", "lifestyle_broll", "product_demo", "emotional"]);

export function resolveProvider(
  sceneType: string,
  premiumBudgetRemaining: number,
): Provider {
  if (SMART_MOTION_TYPES.has(sceneType)) return "smart_motion";
  if (KLING_TYPES.has(sceneType) && premiumBudgetRemaining > 0) return "kling";
  return "smart_motion"; // fallback when budget exhausted
}

export function computeMotionBudget(totalScenes: number, clipSeconds: number): number {
  const estimatedTotalSeconds = totalScenes * clipSeconds;
  return Math.max(2, Math.ceil((estimatedTotalSeconds / 30) * 2));
}

// Provider cost units (used by cost-control)
export const PROVIDER_COST_UNITS: Record<Provider, number> = {
  kling:        8,   // credits per clip
  flux:         2,   // credits per image
  runway:       10,  // credits per clip
  smart_motion: 1,   // credits per clip
};
