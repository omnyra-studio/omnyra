/* GET /api/cron/optimize-funnel
 *
 * Every 12h. Identifies the largest drop-off in the conversion funnel
 * and writes a recommendation to system_insights.
 *
 * Stages tracked:
 *   signup → first_video → second_video → free_to_paid → credit_depletion
 *
 * Reads from analytics_snapshots (where activation, retention, etc.
 * already live). Falls back to direct event aggregation for stages not
 * yet in snapshots.
 */

import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { writeInsight } from "../../../../lib/optimization/insights";
import { recomputeAllRevenueStates } from "../../../../lib/revenue/state";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

async function countDistinctUsers(type: string, since: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("events")
    .select("user_id")
    .eq("type", type)
    .gte("created_at", since)
    .not("user_id", "is", null);
  return new Set((data ?? []).map((r) => r.user_id as string)).size;
}

async function countDistinctPaidConversions(since: string): Promise<number> {
  // Users who subscribed (got positive amount of type 'subscription').
  const { data } = await supabaseAdmin
    .from("credit_transactions")
    .select("user_id")
    .eq("type", "subscription")
    .gt("amount", 0)
    .gte("created_at", since);
  return new Set((data ?? []).map((r) => r.user_id as string)).size;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - 30 * DAY).toISOString();

  const [signups, firstVideo, secondVideoUsers, paid] = await Promise.all([
    countDistinctUsers("user_signed_up", since),
    countDistinctUsers("render_completed", since),
    // Users who completed ≥ 2 videos: count events grouped by user.
    (async () => {
      const { data } = await supabaseAdmin
        .from("events")
        .select("user_id")
        .eq("type", "render_completed")
        .gte("created_at", since);
      const counts = new Map<string, number>();
      for (const r of data ?? []) {
        const id = r.user_id as string | null;
        if (!id) continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      return Array.from(counts.values()).filter((n) => n >= 2).length;
    })(),
    countDistinctPaidConversions(since),
  ]);

  const stages = [
    { from: "signup", to: "first_video", numerator: firstVideo, denominator: signups },
    { from: "first_video", to: "second_video", numerator: secondVideoUsers, denominator: firstVideo },
    { from: "first_video", to: "free_to_paid", numerator: paid, denominator: firstVideo },
  ];

  const ratios = stages.map((s) => ({
    ...s,
    rate: s.denominator === 0 ? 1 : s.numerator / s.denominator,
  }));

  // Bottleneck = stage with lowest conversion (and non-trivial sample).
  const valid = ratios.filter((r) => r.denominator >= 5);
  const bottleneck = valid.length === 0
    ? null
    : valid.reduce((acc, cur) => (cur.rate < acc.rate ? cur : acc), valid[0]);

  let recommended_fix = "no_significant_bottleneck";
  let expected_impact = 0;

  if (bottleneck) {
    if (bottleneck.to === "first_video") {
      recommended_fix = "reduce_onboarding_friction";
      expected_impact = Math.round((0.5 - bottleneck.rate) * 100);
    } else if (bottleneck.to === "second_video") {
      recommended_fix = "post_render_create_variation_prompt";
      expected_impact = Math.round((0.6 - bottleneck.rate) * 100);
    } else if (bottleneck.to === "free_to_paid") {
      recommended_fix = "soft_paywall_after_3_videos";
      expected_impact = Math.round((0.10 - bottleneck.rate) * 100);
    }
  }

  await writeInsight({
    metric_name: "funnel_bottleneck",
    value: bottleneck?.rate ?? 0,
    context: {
      stages: ratios,
      bottleneck_stage: bottleneck ? `${bottleneck.from} → ${bottleneck.to}` : null,
      recommended_fix,
      expected_impact,
    },
    impact_score: Math.max(0, Math.min(100, expected_impact)),
    recommendation: bottleneck
      ? `Funnel bottleneck at ${bottleneck.from} → ${bottleneck.to} (rate=${bottleneck.rate.toFixed(3)}). Try: ${recommended_fix}.`
      : "No significant funnel bottleneck detected.",
    recommendation_action: recommended_fix === "reduce_onboarding_friction"
      ? { type: "reduce_onboarding_friction", reason: `bottleneck_rate=${bottleneck?.rate.toFixed(3)}` }
      : { type: "none" },
  });

  // Background sweep: refresh user_revenue_state for active users so
  // the next decision call hits warm data.
  const refreshed = await recomputeAllRevenueStates(7);

  return Response.json({
    ok: true,
    stages: ratios,
    bottleneck,
    recommended_fix,
    expected_impact,
    revenue_states_refreshed: refreshed,
  });
}
