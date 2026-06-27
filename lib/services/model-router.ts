/**
 * Model Router — selects the cheapest provider that meets quality requirements.
 *
 * Priority matrix:
 *   All scenes → RunwayML gen4_turbo when RUNWAYML_API_SECRET is set (primary)
 *   Fallback    → Kling Pro when VIDEO_PROVIDER_FALLBACK=true and secret is absent
 *
 * Fail-fast: if RUNWAYML_API_SECRET is missing and VIDEO_PROVIDER_FALLBACK is not
 * set to "true", assertProviderConfig() throws before the scene loop runs.
 */

import type { NarrativeRole } from "@/lib/types/scene-compiler";

export type VideoProvider = 'kling' | 'runway' | 'luma';
export type MotionComplexity = 'low' | 'medium' | 'high';
export type KlingMode = 'pro' | 'standard';

export interface ModelRouterInput {
  narrativeRole:    NarrativeRole;
  motionComplexity: MotionComplexity;
  durationSeconds:  number;
  budgetMode:       boolean;
  hasReferenceImage: boolean;
}

export interface ModelRouterDecision {
  provider:          VideoProvider;
  klingMode:         KlingMode;
  motionStrength:    number;   // 0.0–1.0 for Kling
  shouldSplitScene:  boolean;  // true when duration > 45s
  splitChunks?:      number;   // how many 10s chunks to render
  reasoning:         string;
}

const KLING_PRO_COST_PER_CLIP  = 1.0;  // relative unit
const KLING_STD_COST_PER_CLIP  = 0.4;
const LUMA_COST_PER_CLIP       = 0.6;
const RUNWAY_COST_PER_CLIP     = 2.5;

/** Returns true only when RUNWAYML_API_SECRET is actually present at runtime. */
function isRunwayAvailable(): boolean {
  return !!process.env.RUNWAYML_API_SECRET;
}

/**
 * Pre-flight check — call once before the scene generation loop.
 * Throws immediately if Runway is the intended primary provider but the API
 * secret is absent, unless VIDEO_PROVIDER_FALLBACK=true explicitly permits
 * falling back to Kling.
 */
export function assertProviderConfig(): void {
  const runwayPresent  = isRunwayAvailable();
  const fallbackOk     = process.env.VIDEO_PROVIDER_FALLBACK === 'true';

  if (!runwayPresent && !fallbackOk) {
    const msg =
      '[MODEL_ROUTER] RUNWAYML_API_SECRET is not set and VIDEO_PROVIDER_FALLBACK is not enabled. ' +
      'Set RUNWAYML_API_SECRET to use Runway (primary) or set VIDEO_PROVIDER_FALLBACK=true to ' +
      'permit Kling fallback.';
    console.error(msg);
    throw new Error(msg);
  }

  if (!runwayPresent && fallbackOk) {
    console.warn('[MODEL_ROUTER] RUNWAYML_API_SECRET absent — VIDEO_PROVIDER_FALLBACK=true, routing all scenes to Kling Pro');
  }

  if (runwayPresent) {
    console.log('[MODEL_ROUTER] RUNWAYML_API_SECRET present — RunwayML is primary provider');
  }
}

export function selectVideoProvider(input: ModelRouterInput): ModelRouterDecision {
  const { narrativeRole, motionComplexity, durationSeconds, budgetMode, hasReferenceImage } = input;

  const shouldSplitScene = durationSeconds > 45;
  const splitChunks      = shouldSplitScene ? Math.ceil(durationSeconds / 10) : undefined;

  // budgetMode=true means the caller is a free/starter tier — Kling only, no Runway
  if (isRunwayAvailable() && !budgetMode) {
    const decision: ModelRouterDecision = {
      provider:       'runway',
      klingMode:      'pro',
      motionStrength: motionComplexity === 'high' ? 0.85 : 0.75,
      shouldSplitScene,
      splitChunks,
      reasoning: `${narrativeRole} → runway (primary provider)`,
    };
    console.log(`[MODEL_ROUTER] provider=runway role=${narrativeRole} motion=${motionComplexity} reason="${decision.reasoning}"`);
    return decision;
  }

  // Runway unavailable — only reachable when VIDEO_PROVIDER_FALLBACK=true
  // (assertProviderConfig() would have thrown otherwise)
  const motionStrengthMap: Record<MotionComplexity, number> = {
    low: 0.55, medium: 0.75, high: 0.88,
  };

  const decision: ModelRouterDecision = {
    provider:       'kling',
    klingMode:      budgetMode ? 'standard' : 'pro',
    motionStrength: hasReferenceImage ? motionStrengthMap[motionComplexity] : 0.70,
    shouldSplitScene,
    splitChunks,
    reasoning: `${narrativeRole} → kling ${budgetMode ? 'standard' : 'pro'} (runway unavailable, VIDEO_PROVIDER_FALLBACK=true)`,
  };
  console.log(`[MODEL_ROUTER] provider=kling mode=${decision.klingMode} role=${narrativeRole} motion=${motionComplexity} reason="${decision.reasoning}"`);
  return decision;
}

/** Estimate credit cost for a routing decision */
export function estimateRoutingCost(decision: ModelRouterDecision, clipCount = 1): number {
  const perClip = {
    runway: RUNWAY_COST_PER_CLIP,
    luma:   LUMA_COST_PER_CLIP,
    kling:  decision.klingMode === 'pro' ? KLING_PRO_COST_PER_CLIP : KLING_STD_COST_PER_CLIP,
  }[decision.provider];
  const chunks = decision.splitChunks ?? clipCount;
  return Math.round(perClip * chunks * 10) / 10;
}

/** Infer motion complexity from a Kling scene prompt */
export function inferMotionComplexity(prompt: string): MotionComplexity {
  const HIGH_RE = /\b(run|sprint|danc|spin|jump|fight|chase|explod|collide|smash|throw|sweep|wrestl)\b/i;
  const LOW_RE  = /\b(static|still|seated|posed|frozen|standing|resting|sleeping|reading)\b/i;

  if (HIGH_RE.test(prompt)) return 'high';
  if (LOW_RE.test(prompt))  return 'low';
  return 'medium';
}
