/* Recompute user_revenue_state from the canonical sources:
 *   - events (engagement signals)
 *   - renders (output + credits_used)
 *   - credit_transactions (spending signal)
 *   - profiles.plan (plan tier)
 *   - user_profiles_extended (churn_risk_score — already computed)
 *
 * Server-only. The /api/revenue/evaluate route calls this just-in-time
 * for a user; the 12h sweep cron calls it for all active users.
 *
 * All derived score formulas are explicit and explainable per spec §9
 * safety guardrails ("ALL actions must be explainable").
 */

import { supabaseAdmin } from "../supabase/admin";

const DAY = 24 * 60 * 60 * 1000;

const PLAN_VALUE: Record<string, number> = {
  free: 0,
  creator: 29,
  pro: 69,
  studio: 99,
};

export type PlanTier = "free" | "creator" | "pro" | "studio";
export type PriceSensitivity = "low" | "medium" | "high";

export interface RevenueStateRow {
  user_id: string;
  plan_tier: PlanTier;
  monthly_value_score: number;
  churn_risk_score: number;
  upgrade_probability: number;
  lifetime_value_estimate: number;
  price_sensitivity: PriceSensitivity;
  total_spent: number;
  total_credits_used: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function asPlanTier(s: string | null | undefined): PlanTier {
  if (s === "creator" || s === "pro" || s === "studio") return s;
  return "free";
}

export async function recomputeUserRevenueState(userId: string): Promise<RevenueStateRow | null> {
  const now = Date.now();
  const since30d = new Date(now - 30 * DAY).toISOString();

  // ── 1. Plan tier ──────────────────────────────────────────────
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .single();
  const plan_tier: PlanTier = asPlanTier(profile?.plan ?? "free");

  // ── 2. Spending (real revenue from credit_transactions) ──────
  const pricePerCredit = Number(process.env.REVENUE_PRICE_PER_CREDIT ?? "0.10");
  const { data: spendRows } = await supabaseAdmin
    .from("credit_transactions")
    .select("amount, type")
    .eq("user_id", userId)
    .in("type", ["subscription", "topup"])
    .gt("amount", 0);
  const total_spent = (spendRows ?? [])
    .reduce((sum, r) => sum + Number(r.amount), 0) * pricePerCredit;

  // ── 3. Total credits used ─────────────────────────────────────
  const { data: usageRows } = await supabaseAdmin
    .from("credit_transactions")
    .select("amount")
    .eq("user_id", userId)
    .lt("amount", 0);
  const total_credits_used = (usageRows ?? [])
    .reduce((sum, r) => sum + Math.abs(Number(r.amount)), 0);

  // ── 4. Churn risk (mirror from user_profiles_extended) ───────
  const { data: upx } = await supabaseAdmin
    .from("user_profiles_extended")
    .select("churn_risk_score, conversion_behavior, success_pattern")
    .eq("user_id", userId)
    .maybeSingle();
  const churn_risk_score = clamp(Number(upx?.churn_risk_score ?? 0), 0, 100);

  // ── 5. Activity signals (last 30d) ───────────────────────────
  const { count: rendersCompleted } = await supabaseAdmin
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("type", "render_completed")
    .gte("created_at", since30d);
  const completed_30d = Number(rendersCompleted ?? 0);

  const { count: sharesCount } = await supabaseAdmin
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("type", "video_shared")
    .gte("created_at", since30d);
  const shares_30d = Number(sharesCount ?? 0);

  // Average viral_score of the user's renders.
  const { data: csRows } = await supabaseAdmin
    .from("content_scores")
    .select("viral_score")
    .eq("user_id", userId)
    .gte("recalculated_at", since30d);
  const csScores = (csRows ?? [])
    .map((r) => Number(r.viral_score))
    .filter(Number.isFinite);
  const avg_viral = csScores.length === 0 ? 0 : csScores.reduce((a, b) => a + b, 0) / csScores.length;

  // ── 6. monthly_value_score (0–1000) ──────────────────────────
  // Composition (explainable):
  //   plan multiplier (0–500): plan_value * scaling factor
  //   activity (0–300): renders + shares contribution
  //   virality (0–200): avg_viral / 100 * 200
  const planComp = Math.min(500, PLAN_VALUE[plan_tier] * 5);
  const activityComp = Math.min(300, completed_30d * 20 + shares_30d * 10);
  const viralComp = Math.min(200, (avg_viral / 100) * 200);
  const monthly_value_score = clamp(planComp + activityComp + viralComp, 0, 1000);

  // ── 7. upgrade_probability (0–100) ───────────────────────────
  // Free-tier with high activity / virality → strong upgrade signal.
  // Already on highest tier → zero.
  let upgrade_probability = 0;
  if (plan_tier !== "studio") {
    const isFree = plan_tier === "free";
    const activityScore = Math.min(40, completed_30d * 8);
    const viralScore = Math.min(40, (avg_viral / 100) * 40);
    const tierGap = isFree ? 20 : plan_tier === "creator" ? 10 : 5;
    upgrade_probability = clamp(activityScore + viralScore + tierGap, 0, 100);
  }

  // ── 8. lifetime_value_estimate ────────────────────────────────
  // Conservative: total_spent + projected (monthly_value_dollars *
  // expected_months * (1 - churn_risk/100)).
  const monthlyValueDollars = PLAN_VALUE[plan_tier];
  const expectedMonths = 12;
  const retentionFactor = 1 - churn_risk_score / 100;
  const projected = monthlyValueDollars * expectedMonths * retentionFactor;
  const lifetime_value_estimate = Math.round(total_spent + projected);

  // ── 9. price_sensitivity ──────────────────────────────────────
  // Heuristics:
  //   - has converted on offers before → low
  //   - has dismissed multiple offers → high
  //   - default → medium
  const { count: acceptedOffers } = await supabaseAdmin
    .from("revenue_events")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_type", "offer_accepted");
  const { count: dismissedOffers } = await supabaseAdmin
    .from("revenue_events")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_type", "offer_dismissed");

  let price_sensitivity: PriceSensitivity = "medium";
  if ((acceptedOffers ?? 0) >= 2) price_sensitivity = "low";
  else if ((dismissedOffers ?? 0) >= 3 && (acceptedOffers ?? 0) === 0) price_sensitivity = "high";

  // ── 10. Persist ─────────────────────────────────────────────
  const row = {
    user_id: userId,
    plan_tier,
    monthly_value_score,
    churn_risk_score,
    upgrade_probability,
    lifetime_value_estimate,
    price_sensitivity,
    total_spent,
    total_credits_used,
  };

  const { error } = await supabaseAdmin
    .from("user_revenue_state")
    .upsert(row, { onConflict: "user_id" });

  if (error) {
    console.error("[revenue/state] upsert failed:", error.message);
    return null;
  }

  return row;
}

/** Bulk-recompute for all users with activity in the window. */
export async function recomputeAllRevenueStates(windowDays: number = 30): Promise<number> {
  const since = new Date(Date.now() - windowDays * DAY).toISOString();
  const { data: active } = await supabaseAdmin
    .from("events")
    .select("user_id")
    .gte("created_at", since)
    .not("user_id", "is", null);
  const ids = Array.from(new Set((active ?? []).map((r) => r.user_id as string)));

  let n = 0;
  for (const id of ids) {
    try {
      await recomputeUserRevenueState(id);
      n += 1;
    } catch (err) {
      console.error("[revenue/state] recompute failed for", id, err);
    }
  }
  return n;
}
