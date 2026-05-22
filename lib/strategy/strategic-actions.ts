/* Strategic action generator.
 *
 * Reads from the canonical state (template_scores, user_scores,
 * funnel_metrics, analytics_snapshots) and emits a ranked list of
 * `strategic_actions`. Each action lands in company_memory.
 *
 * The engine is deterministic and explainable — every action has a
 * reason citing the metric it derives from.
 */

import { supabaseAdmin } from "../supabase/admin";

export interface StrategicAction {
  action: string;
  reason: string;
  expected_revenue_impact_pct: number;
  category: "product" | "marketing" | "revenue" | "ux" | "growth";
  source_metrics: Record<string, unknown>;
}

const TOP_TEMPLATE_PROMOTE_THRESHOLD = 65;
const BOTTOM_TEMPLATE_HIDE_THRESHOLD = 35;
const LOW_ACTIVATION_RATE = 0.30;
const HIGH_REGENERATE_RATE = 0.50;

export async function generateStrategicActions(): Promise<StrategicAction[]> {
  const actions: StrategicAction[] = [];

  // ── Product: champion the top template ──────────────────────────
  const { data: topTemplates } = await supabaseAdmin
    .from("template_scores")
    .select("template, avg_viral_score, composite_score, completed_renders")
    .order("composite_score", { ascending: false })
    .limit(3);

  if (topTemplates && topTemplates[0]) {
    const t = topTemplates[0];
    if (Number(t.composite_score) >= TOP_TEMPLATE_PROMOTE_THRESHOLD && Number(t.completed_renders) >= 10) {
      actions.push({
        action: `Increase focus on "${t.template}" template`,
        reason: `Highest composite_score (${Number(t.composite_score).toFixed(1)}) over ${t.completed_renders} completed renders`,
        expected_revenue_impact_pct: 15,
        category: "product",
        source_metrics: { template: t.template, composite_score: t.composite_score },
      });
    }
  }

  // ── Product: retire the worst template ──────────────────────────
  const { data: bottomTemplates } = await supabaseAdmin
    .from("template_scores")
    .select("template, avg_viral_score, composite_score, completed_renders")
    .gte("completed_renders", 10)
    .order("composite_score", { ascending: true })
    .limit(1);

  if (bottomTemplates && bottomTemplates[0]) {
    const t = bottomTemplates[0];
    if (Number(t.composite_score) < BOTTOM_TEMPLATE_HIDE_THRESHOLD) {
      actions.push({
        action: `Soft-hide "${t.template}" template`,
        reason: `Lowest composite_score (${Number(t.composite_score).toFixed(1)}); user time is better spent elsewhere`,
        expected_revenue_impact_pct: 3,
        category: "product",
        source_metrics: { template: t.template, composite_score: t.composite_score },
      });
    }
  }

  // ── UX: activation rate ─────────────────────────────────────────
  const { data: activationRow } = await supabaseAdmin
    .from("analytics_snapshots")
    .select("value, context")
    .eq("metric_name", "activation_rate")
    .eq("scope", "global")
    .order("snapshot_at", { ascending: false })
    .limit(1);
  if (activationRow && activationRow[0]) {
    const rate = Number(activationRow[0].value);
    if (rate < LOW_ACTIVATION_RATE) {
      actions.push({
        action: "Simplify onboarding",
        reason: `Activation rate is ${(rate * 100).toFixed(1)}% (below ${LOW_ACTIVATION_RATE * 100}% target)`,
        expected_revenue_impact_pct: 12,
        category: "ux",
        source_metrics: { activation_rate: rate, context: activationRow[0].context ?? {} },
      });
    }
  }

  // ── Product: regenerate rate (script quality) ──────────────────
  const { data: regenRow } = await supabaseAdmin
    .from("system_insights")
    .select("value")
    .eq("metric_name", "regenerate_rate")
    .order("created_at", { ascending: false })
    .limit(1);
  if (regenRow && regenRow[0] && Number(regenRow[0].value) > HIGH_REGENERATE_RATE) {
    actions.push({
      action: "Tune script generation prompts",
      reason: `Regenerate rate is ${(Number(regenRow[0].value) * 100).toFixed(1)}% — users are unhappy with first drafts`,
      expected_revenue_impact_pct: 8,
      category: "product",
      source_metrics: { regenerate_rate: Number(regenRow[0].value) },
    });
  }

  // ── Revenue: ARPU trend ─────────────────────────────────────────
  const { data: arpuRows } = await supabaseAdmin
    .from("analytics_snapshots")
    .select("value, snapshot_at")
    .eq("metric_name", "revenue_per_user")
    .eq("scope", "global")
    .order("snapshot_at", { ascending: false })
    .limit(2);
  if (arpuRows && arpuRows.length === 2) {
    const current = Number(arpuRows[0].value);
    const prior = Number(arpuRows[1].value);
    if (prior > 0 && current < prior * 0.9) {
      actions.push({
        action: "Run upgrade-prompt experiment for active free-tier users",
        reason: `ARPU dropped from $${prior.toFixed(2)} to $${current.toFixed(2)} (${(((current - prior) / prior) * 100).toFixed(1)}%)`,
        expected_revenue_impact_pct: 18,
        category: "revenue",
        source_metrics: { current_arpu: current, prior_arpu: prior },
      });
    }
  }

  // ── Marketing: top template → asset generation seed ─────────────
  if (topTemplates && topTemplates[0]) {
    const t = topTemplates[0];
    actions.push({
      action: `Generate marketing assets for "${t.template}"`,
      reason: `Top-performing template (composite_score=${Number(t.composite_score).toFixed(1)}) — leverage in TikTok / ad copy / landing page headlines`,
      expected_revenue_impact_pct: 10,
      category: "marketing",
      source_metrics: { template: t.template, composite_score: t.composite_score },
    });
  }

  // ── Growth: competitor pricing reaction ─────────────────────────
  const { data: competitorPricing } = await supabaseAdmin
    .from("competitor_signals")
    .select("competitor_name, signal_type, pricing_changes, detected_at")
    .eq("signal_type", "pricing")
    .order("detected_at", { ascending: false })
    .limit(1);
  if (competitorPricing && competitorPricing[0]) {
    const sig = competitorPricing[0];
    actions.push({
      action: `React to ${sig.competitor_name} pricing move`,
      reason: `Detected pricing change at ${sig.detected_at} — reposition value or adjust bonus credits before churn spreads`,
      expected_revenue_impact_pct: 5,
      category: "growth",
      source_metrics: { competitor: sig.competitor_name, pricing_changes: sig.pricing_changes ?? {} },
    });
  }

  // Rank by expected impact.
  actions.sort((a, b) => b.expected_revenue_impact_pct - a.expected_revenue_impact_pct);
  return actions;
}

/**
 * Convert each strategic action into a roadmap_items row. The engine
 * estimates effort heuristically per category; humans can refine later
 * by editing the row (status flow: planned → building → shipped).
 */
const EFFORT_BY_CATEGORY: Record<StrategicAction["category"], number> = {
  marketing: 25,
  ux: 40,
  product: 55,
  revenue: 45,
  growth: 50,
};

export async function syncRoadmap(actions: StrategicAction[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;

  for (const a of actions) {
    // De-dup on feature_name within the last 30 days.
    const { data: existing } = await supabaseAdmin
      .from("roadmap_items")
      .select("id, impact_score, effort_score, status")
      .eq("feature_name", a.action)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    const effort = EFFORT_BY_CATEGORY[a.category];
    const impact = Math.max(0, Math.min(100, a.expected_revenue_impact_pct * 5)); // 0..100 scale

    if (existing && existing[0]) {
      // Refresh scores; don't touch status.
      await supabaseAdmin
        .from("roadmap_items")
        .update({
          impact_score: impact,
          effort_score: effort,
          rationale: a.reason,
          source_metrics: a.source_metrics,
        })
        .eq("id", existing[0].id);
      updated += 1;
    } else {
      await supabaseAdmin.from("roadmap_items").insert({
        feature_name: a.action,
        category: a.category,
        description: a.reason,
        impact_score: impact,
        effort_score: effort,
        rationale: a.reason,
        source_metrics: a.source_metrics,
      });
      inserted += 1;
    }
  }
  return { inserted, updated };
}
