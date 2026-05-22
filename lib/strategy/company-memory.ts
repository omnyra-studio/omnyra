/* Company memory writer.
 *
 * Append-only insertions into `company_memory`. The strategy engine
 * promotes high-impact tactical insights from `system_insights` and
 * adds its own derived insights from analytics_snapshots into the
 * long-term memory.
 *
 * Server-only.
 */

import { supabaseAdmin } from "../supabase/admin";

export type MemoryCategory = "product" | "marketing" | "revenue" | "ux" | "growth";

export interface MemoryEntry {
  category: MemoryCategory;
  insight: string;
  confidence_score: number;
  impact_score: number;
  source_metrics?: Record<string, unknown>;
  source_insight_id?: string | null;
}

export async function writeMemory(entry: MemoryEntry): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("company_memory")
    .insert({
      category: entry.category,
      insight: entry.insight,
      confidence_score: Math.max(0, Math.min(100, Math.round(entry.confidence_score))),
      impact_score: Math.max(0, Math.min(100, Math.round(entry.impact_score))),
      source_metrics: entry.source_metrics ?? {},
      source_insight_id: entry.source_insight_id ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[company_memory] insert failed:", error.message);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Pull the most recent insights from `system_insights` and promote
 * the high-impact ones into company_memory. Idempotency is approximate
 * — we tag the source_insight_id so duplicates can be detected and
 * skipped.
 */
export async function promoteSystemInsights(hours: number = 24): Promise<number> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data: insights } = await supabaseAdmin
    .from("system_insights")
    .select("id, metric_name, value, recommendation, impact_score, context")
    .gte("created_at", since)
    .gte("impact_score", 60)
    .order("impact_score", { ascending: false })
    .limit(50);

  if (!insights || insights.length === 0) return 0;

  // Skip insights we've already promoted.
  const ids = insights.map((r) => r.id);
  const { data: existing } = await supabaseAdmin
    .from("company_memory")
    .select("source_insight_id")
    .in("source_insight_id", ids);
  const seen = new Set((existing ?? []).map((r) => r.source_insight_id));

  let written = 0;
  for (const ins of insights) {
    if (seen.has(ins.id)) continue;

    // Map metric → category. Default to growth.
    const m = String(ins.metric_name);
    const category: MemoryCategory =
      m.startsWith("template_") || m.includes("regenerate") ? "product"
      : m === "activation_rate" || m === "time_to_first_video" ? "ux"
      : m === "credit_efficiency" || m === "revenue_per_user" ? "revenue"
      : m === "churn_risk_user" || m === "churn_risk_score" ? "growth"
      : "growth";

    await writeMemory({
      category,
      insight: ins.recommendation ?? `${m}=${Number(ins.value).toFixed(2)}`,
      confidence_score: Math.min(100, Number(ins.impact_score)),
      impact_score: Number(ins.impact_score),
      source_metrics: { metric_name: m, value: Number(ins.value), context: ins.context ?? {} },
      source_insight_id: ins.id,
    });
    written += 1;
  }
  return written;
}
