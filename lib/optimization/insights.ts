/* Insight writer for the AGS.
 *
 * Inserts a row into `system_insights` for each computed metric, with a
 * structured `recommendation_action`. Recommendations are NOT auto-
 * applied unless OMNYRA_AGS_AUTO_APPLY=true. By default the engine is
 * write-only (observation mode) — see the governor rules in the spec.
 */

import { supabaseAdmin } from "../supabase/admin";

export type RecommendationAction =
  | { type: "promote_template"; template: string; reason: string }
  | { type: "soft_hide_template"; template: string; reason: string }
  | { type: "flag_churn_risk"; user_id: string; risk_score: number }
  | { type: "suggest_pricing_adjustment"; direction: "up" | "down"; pct: number }
  | { type: "grant_retention_credits"; user_id: string; amount: number }
  | { type: "reduce_onboarding_friction"; reason: string }
  | { type: "none" };

export interface InsightInput {
  metric_name: string;
  value: number;
  context?: Record<string, unknown>;
  trend_direction?: "up" | "down" | "flat";
  impact_score?: number;
  recommendation?: string;
  recommendation_action?: RecommendationAction;
}

export async function writeInsight(input: InsightInput): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("system_insights")
    .insert({
      metric_name: input.metric_name,
      value: input.value,
      context: input.context ?? {},
      trend_direction: input.trend_direction ?? null,
      impact_score: input.impact_score ?? 0,
      recommendation: input.recommendation ?? null,
      recommendation_action: input.recommendation_action ?? { type: "none" },
    })
    .select("id")
    .single();

  if (error) {
    console.error(`[insights] failed to write ${input.metric_name}:`, error.message);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Mark an insight as applied. Called by the appliers (template settings,
 * credit grants, etc.) once they execute the recommendation.
 */
export async function markInsightApplied(
  insightId: string,
  appliedBy: string,
): Promise<void> {
  await supabaseAdmin
    .from("system_insights")
    .update({
      applied_at: new Date().toISOString(),
      applied_by: appliedBy,
    })
    .eq("id", insightId);
}

/** Whether the auto-applier should run. Default off. */
export function autoApplyEnabled(): boolean {
  return process.env.OMNYRA_AGS_AUTO_APPLY === "true";
}
