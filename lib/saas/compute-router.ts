/**
 * ComputeRouter — maps a generation job to the right provider + tier,
 * respecting the user's plan limits and current provider health.
 *
 * Delegates final provider selection to the existing model-router but adds
 * plan-awareness so Free users never hit premium-only providers.
 */

import { selectVideoProvider, inferMotionComplexity } from "@/lib/services/model-router";

export type UserPlan = 'free' | 'starter' | 'creator' | 'studio';

export interface RouteDecision {
  provider:      'kling' | 'runway' | 'fal';
  model:         string;
  reason:        string;
  estimatedCr:   number; // credits this job will cost
  fusionAllowed: boolean; // true = run both providers + pick best
}

const PLAN_RUNWAY_ACCESS: Record<UserPlan, boolean> = {
  free:    false,
  starter: false,
  creator: true,
  studio:  true,
};

const PLAN_FUSION_ACCESS: Record<UserPlan, boolean> = {
  free:    false,
  starter: false,
  creator: false,
  studio:  true,
};

export function routeCompute(params: {
  narrativeRole:     'hook' | 'development' | 'climax' | 'resolution';
  prompt:            string;
  durationSeconds:   number;
  hasReferenceImage: boolean;
  userPlan:          UserPlan;
}): RouteDecision {
  const canUseRunway = PLAN_RUNWAY_ACCESS[params.userPlan];
  const canFuse      = PLAN_FUSION_ACCESS[params.userPlan];

  const motionComplexity = inferMotionComplexity(params.prompt);

  const routerDecision = selectVideoProvider({
    narrativeRole:     params.narrativeRole,
    motionComplexity,
    durationSeconds:   params.durationSeconds,
    budgetMode:        !canUseRunway,
    hasReferenceImage: params.hasReferenceImage,
  });

  const provider = routerDecision.provider as 'kling' | 'runway';

  return {
    provider,
    model:         provider === 'runway' ? 'gen4_turbo' : 'kling-v2.6-pro',
    reason:        `${routerDecision.reasoning} plan=${params.userPlan}`,
    estimatedCr:   params.durationSeconds === 10 ? 25 : 50,
    fusionAllowed: canFuse && params.narrativeRole !== 'development',
  };
}
