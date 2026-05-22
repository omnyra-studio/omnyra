/* GET /api/cron/optimize-system
 *
 * Scheduled run of the Autonomous Growth System (AGS).
 * Triggered every 6 hours by Vercel Cron (see vercel.json).
 *
 *   1. Aggregate the event stream into system metrics.
 *   2. Compute trend direction vs the prior run.
 *   3. Write one system_insights row per metric, with a structured
 *      recommendation_action describing what the system would like to
 *      do.
 *   4. Recompute user_profiles_extended for active users.
 *   5. Compute churn signals; persist into user_profiles_extended.
 *
 * Recommendations are NEVER auto-executed by default — this route is
 * observation-mode. Set OMNYRA_AGS_AUTO_APPLY=true to arm the appliers.
 *
 * Cron security: Vercel adds `Authorization: Bearer <CRON_SECRET>`
 * automatically. If CRON_SECRET is set, we verify it.
 */

import {
  computeActivationRate,
  computeTimeToFirstVideo,
  computeRenderCompletionRate,
  computeTemplateStats,
  computeRegenerateRate,
  computeCreditEfficiency,
  computeViralOutputRatio,
  detectTrendDirection,
} from "../../../../lib/optimization/metrics";
import { writeInsight, type RecommendationAction } from "../../../../lib/optimization/insights";
import { computeChurnSignals, persistChurnSignals } from "../../../../lib/optimization/churn";
import { recomputeAllUserProfiles } from "../../../../lib/optimization/personalization";
import { recomputeContentPerformance } from "../../../../lib/optimization/templates";
import { applyPendingInsights } from "../../../../lib/optimization/appliers";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const TEMPLATE_PROMOTE_THRESHOLD = 65;
const TEMPLATE_HIDE_VIRAL_THRESHOLD = 35;
const TEMPLATE_HIDE_MIN_SAMPLES = 10;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // unset = open (dev). Set in prod.
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const results: Record<string, unknown> = {};

  // ── 1. Aggregate metrics ────────────────────────────────────────
  const [
    activation,
    ttfv,
    completion,
    regenerate,
    efficiency,
    viralRatio,
  ] = await Promise.all([
    computeActivationRate(7),
    computeTimeToFirstVideo(30),
    computeRenderCompletionRate(7),
    computeRegenerateRate(7),
    computeCreditEfficiency(7),
    computeViralOutputRatio(60, 30),
  ]);

  const metrics = [activation, ttfv, completion, regenerate, efficiency, viralRatio];

  // ── 2. For each metric: detect trend, recommend, log ────────────
  for (const m of metrics) {
    const trend = await detectTrendDirection(m.metric_name, m.value);

    let recommendation: string | null = null;
    let recommendation_action: RecommendationAction = { type: "none" };
    let impact_score = 0;

    if (m.metric_name === "activation_rate" && m.value < 0.25 && trend === "down") {
      recommendation = "Activation rate declining — reduce onboarding friction";
      recommendation_action = {
        type: "reduce_onboarding_friction",
        reason: `activation_rate=${m.value.toFixed(3)} trending ${trend}`,
      };
      impact_score = 90;
    } else if (m.metric_name === "render_completion_rate" && m.value < 0.7) {
      recommendation = "Completion rate low — investigate pipeline failures";
      impact_score = 80;
    } else if (m.metric_name === "regenerate_rate" && m.value > 0.5) {
      recommendation = "High regenerate rate — script quality may be off";
      impact_score = 60;
    } else if (m.metric_name === "credit_efficiency" && trend === "down") {
      recommendation = "Engagement per credit declining — review template mix";
      impact_score = 50;
    }

    await writeInsight({
      ...m,
      trend_direction: trend,
      impact_score,
      recommendation: recommendation ?? undefined,
      recommendation_action,
    });
  }

  results.metrics_written = metrics.length;

  // ── 3. Per-template recommendations ─────────────────────────────
  const templateStats = await computeTemplateStats();
  let templatePromotions = 0;
  let templateHides = 0;

  for (const t of templateStats) {
    if (t.total < TEMPLATE_HIDE_MIN_SAMPLES) continue; // need samples to act

    if (t.avg_viral_score >= TEMPLATE_PROMOTE_THRESHOLD) {
      await writeInsight({
        metric_name: "template_promote",
        value: t.avg_viral_score,
        context: { template: t.template, ...t },
        trend_direction: "up",
        impact_score: 70,
        recommendation: `Promote template "${t.template}" — avg viral score ${t.avg_viral_score.toFixed(1)}`,
        recommendation_action: {
          type: "promote_template",
          template: t.template,
          reason: `avg_viral_score=${t.avg_viral_score.toFixed(1)} over ${t.total} renders`,
        },
      });
      templatePromotions += 1;
    } else if (t.avg_viral_score < TEMPLATE_HIDE_VIRAL_THRESHOLD) {
      await writeInsight({
        metric_name: "template_hide",
        value: t.avg_viral_score,
        context: { template: t.template, ...t },
        trend_direction: "down",
        impact_score: 50,
        recommendation: `Soft-hide template "${t.template}" — avg viral score ${t.avg_viral_score.toFixed(1)}`,
        recommendation_action: {
          type: "soft_hide_template",
          template: t.template,
          reason: `avg_viral_score=${t.avg_viral_score.toFixed(1)} over ${t.total} renders`,
        },
      });
      templateHides += 1;
    }
  }

  results.template_promotions = templatePromotions;
  results.template_hides = templateHides;

  // ── 4. Recompute personalization rows ───────────────────────────
  results.profiles_updated = await recomputeAllUserProfiles(1000);

  // ── 4b. Recompute per-template performance + velocity ───────────
  results.template_performance_rows = await recomputeContentPerformance();

  // ── 5. Churn detection ──────────────────────────────────────────
  const churnSignals = await computeChurnSignals(500);
  await persistChurnSignals(churnSignals);
  results.churn_signals = churnSignals.length;
  results.high_risk_users = churnSignals.filter((s) => s.risk_score >= 70).length;

  // Log each high-risk user as a flag_churn_risk insight (actionable
  // by the retention applier when auto-apply is enabled).
  for (const s of churnSignals.filter((sig) => sig.risk_score >= 70)) {
    await writeInsight({
      metric_name: "churn_risk_user",
      value: s.risk_score,
      context: { user_id: s.user_id, reasons: s.reasons },
      trend_direction: "up",
      impact_score: Math.min(100, s.risk_score),
      recommendation: `User ${s.user_id} is at risk (${s.risk_score}). Reasons: ${s.reasons.join(", ")}`,
      recommendation_action: {
        type: "flag_churn_risk",
        user_id: s.user_id,
        risk_score: s.risk_score,
      },
    });
  }

  // ── 6. Apply pending insights (safe ones always, gated when armed) ─
  results.appliers = await applyPendingInsights();

  results.duration_ms = Date.now() - startedAt;
  return Response.json({ ok: true, results });
}
