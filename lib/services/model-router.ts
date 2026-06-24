/**
 * Model Router — selects the cheapest provider that meets quality requirements.
 *
 * Priority matrix:
 *   climax/hook scenes → best available (Runway when live, Kling Pro otherwise)
 *   development scenes → Kling Pro (good quality, fast)
 *   resolution scenes  → Kling Pro
 *   b-roll / background → cheapest available (Luma when live, Kling standard)
 *   duration > 45s     → auto-split into chunks
 *
 * Currently: Runway and Luma are not wired — all routes to Kling Pro.
 * Router logic is correct for when providers are re-added.
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

// Providers currently available in the pipeline
const AVAILABLE_PROVIDERS: VideoProvider[] = ['runway', 'kling']; // 'luma' when wired

function isAvailable(p: VideoProvider): boolean {
  return AVAILABLE_PROVIDERS.includes(p);
}

function bestOf(...preferred: VideoProvider[]): VideoProvider {
  return preferred.find(isAvailable) ?? 'kling';
}

export function selectVideoProvider(input: ModelRouterInput): ModelRouterDecision {
  const { narrativeRole, motionComplexity, durationSeconds, budgetMode, hasReferenceImage } = input;

  const shouldSplitScene = durationSeconds > 45;
  const splitChunks      = shouldSplitScene ? Math.ceil(durationSeconds / 10) : undefined;

  // All scenes → Runway (primary provider for quality and prompt fidelity)
  if (isAvailable('runway')) {
    return {
      provider:       'runway',
      klingMode:      'pro',
      motionStrength: motionComplexity === 'high' ? 0.85 : 0.75,
      shouldSplitScene,
      splitChunks,
      reasoning: `${narrativeRole} → runway (primary provider)`,
    };
  }

  // Runway unavailable — fallback to Kling Pro
  const motionStrengthMap: Record<MotionComplexity, number> = {
    low: 0.55, medium: 0.75, high: 0.88,
  };

  return {
    provider:       'kling',
    klingMode:      budgetMode ? 'standard' : 'pro',
    motionStrength: hasReferenceImage ? motionStrengthMap[motionComplexity] : 0.70,
    shouldSplitScene,
    splitChunks,
    reasoning: `${narrativeRole} → kling ${budgetMode ? 'standard' : 'pro'} (runway unavailable)`,
  };
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
