import { supabaseAdmin } from "@/lib/supabase/admin";

export type UserPlan = 'free' | 'starter' | 'creator' | 'studio';

export interface PlanLimits {
  maxGenerationsPerDay:  number;
  maxVideoSeconds:       number;
  continuationAllowed:   boolean;
  fusionRenderAllowed:   boolean;
  runwayAllowed:         boolean;
  priorityQueue:         boolean;
}

export const PLAN_LIMITS: Record<UserPlan, PlanLimits> = {
  free: {
    maxGenerationsPerDay:  2,
    maxVideoSeconds:       30,
    continuationAllowed:   false,
    fusionRenderAllowed:   false,
    runwayAllowed:         false,
    priorityQueue:         false,
  },
  starter: {
    maxGenerationsPerDay:  10,
    maxVideoSeconds:       30,
    continuationAllowed:   true,
    fusionRenderAllowed:   false,
    runwayAllowed:         false,
    priorityQueue:         false,
  },
  creator: {
    maxGenerationsPerDay:  30,
    maxVideoSeconds:       60,
    continuationAllowed:   true,
    fusionRenderAllowed:   false,
    runwayAllowed:         true,
    priorityQueue:         false,
  },
  studio: {
    maxGenerationsPerDay:  100,
    maxVideoSeconds:       120,
    continuationAllowed:   true,
    fusionRenderAllowed:   true,
    runwayAllowed:         true,
    priorityQueue:         true,
  },
};

export interface EnforcementResult {
  allowed:   boolean;
  reason?:   string;
  limits:    PlanLimits;
  usedToday: number;
}

export class PlanEnforcer {
  async check(userId: string, feature: keyof PlanLimits | 'generate'): Promise<EnforcementResult> {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('plan, generations_today, generations_reset_at')
      .eq('id', userId)
      .single();

    const plan: UserPlan = (profile?.plan as UserPlan) ?? 'free';
    const limits = PLAN_LIMITS[plan];

    // Reset counter if it's a new day
    const resetAt = profile?.generations_reset_at ? new Date(profile.generations_reset_at) : new Date(0);
    const now = new Date();
    let usedToday: number = profile?.generations_today ?? 0;
    if (resetAt.toDateString() !== now.toDateString()) {
      usedToday = 0;
      await supabaseAdmin
        .from('profiles')
        .update({ generations_today: 0, generations_reset_at: now.toISOString() })
        .eq('id', userId);
    }

    if (feature === 'generate') {
      if (usedToday >= limits.maxGenerationsPerDay) {
        return { allowed: false, reason: `Daily limit of ${limits.maxGenerationsPerDay} generations reached`, limits, usedToday };
      }
      return { allowed: true, limits, usedToday };
    }

    const featureFlag = limits[feature];
    if (typeof featureFlag === 'boolean' && !featureFlag) {
      return { allowed: false, reason: `${String(feature)} requires a higher plan`, limits, usedToday };
    }

    return { allowed: true, limits, usedToday };
  }

  async incrementGenerations(userId: string): Promise<void> {
    await supabaseAdmin.rpc('increment_generations_today', { p_user_id: userId });
  }
}
