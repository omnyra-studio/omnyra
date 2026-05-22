/* Pure metric computations for the Autonomous Growth System.
 *
 * Each function aggregates from `events`, `renders`, and `content_scores`
 * and returns a structured result. Side-effect-free — the cron route
 * orchestrates and writes results to `system_insights`.
 *
 * Server-only. Uses supabaseAdmin.
 */

import { supabaseAdmin } from "../supabase/admin";

const DEFAULT_WINDOW_DAYS = 7;

function windowStart(days: number = DEFAULT_WINDOW_DAYS): string {
  const ms = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

export interface MetricResult {
  metric_name: string;
  value: number;
  context: Record<string, unknown>;
}

/* ─── activation_rate ───────────────────────────────────────────
 * Of users who signed up in the window, what fraction reached
 * render_completed? Activation = first video successfully created.
 */
export async function computeActivationRate(
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<MetricResult> {
  const since = windowStart(windowDays);

  const { data: signups } = await supabaseAdmin
    .from("events")
    .select("user_id")
    .eq("type", "user_signed_up")
    .gte("created_at", since);

  const signupIds = new Set((signups ?? []).map((r) => r.user_id).filter(Boolean) as string[]);

  if (signupIds.size === 0) {
    return {
      metric_name: "activation_rate",
      value: 0,
      context: { window_days: windowDays, sample_size: 0 },
    };
  }

  const { data: activations } = await supabaseAdmin
    .from("events")
    .select("user_id")
    .eq("type", "render_completed")
    .gte("created_at", since)
    .in("user_id", Array.from(signupIds));

  const activatedIds = new Set((activations ?? []).map((r) => r.user_id).filter(Boolean) as string[]);
  const rate = activatedIds.size / signupIds.size;

  return {
    metric_name: "activation_rate",
    value: rate,
    context: {
      window_days: windowDays,
      signups: signupIds.size,
      activations: activatedIds.size,
    },
  };
}

/* ─── time_to_first_video (seconds, median) ─────────────────── */
export async function computeTimeToFirstVideo(
  windowDays: number = 30,
): Promise<MetricResult> {
  const { data, error } = await supabaseAdmin
    .from("time_to_first_video")
    .select("seconds_to_first_video")
    .not("seconds_to_first_video", "is", null)
    .gte("signed_up_at", windowStart(windowDays));

  if (error || !data || data.length === 0) {
    return {
      metric_name: "time_to_first_video",
      value: 0,
      context: { window_days: windowDays, sample_size: 0 },
    };
  }

  const seconds = data
    .map((r) => Number(r.seconds_to_first_video))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  const mid = Math.floor(seconds.length / 2);
  const median = seconds.length % 2 ? seconds[mid] : (seconds[mid - 1] + seconds[mid]) / 2;

  return {
    metric_name: "time_to_first_video",
    value: median,
    context: {
      window_days: windowDays,
      sample_size: seconds.length,
      p25: seconds[Math.floor(seconds.length * 0.25)],
      p75: seconds[Math.floor(seconds.length * 0.75)],
    },
  };
}

/* ─── render_completion_rate ────────────────────────────────── */
export async function computeRenderCompletionRate(
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<MetricResult> {
  const since = windowStart(windowDays);

  const { count: requested } = await supabaseAdmin
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("type", "render_requested")
    .gte("created_at", since);

  const { count: completed } = await supabaseAdmin
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("type", "render_completed")
    .gte("created_at", since);

  const rate = (requested ?? 0) === 0 ? 0 : (completed ?? 0) / (requested ?? 1);

  return {
    metric_name: "render_completion_rate",
    value: rate,
    context: {
      window_days: windowDays,
      requested: requested ?? 0,
      completed: completed ?? 0,
    },
  };
}

/* ─── template_success_rate (per template) ───────────────────── */
export interface TemplateStat {
  template: string;
  completed: number;
  total: number;
  completion_pct: number;
  avg_viral_score: number;
}

export async function computeTemplateStats(): Promise<TemplateStat[]> {
  const { data, error } = await supabaseAdmin
    .from("top_templates")
    .select("template, completed_renders, total_renders, completion_pct, avg_viral_score");

  if (error || !data) return [];

  return data.map((row) => ({
    template: String(row.template),
    completed: Number(row.completed_renders ?? 0),
    total: Number(row.total_renders ?? 0),
    completion_pct: Number(row.completion_pct ?? 0),
    avg_viral_score: Number(row.avg_viral_score ?? 0),
  }));
}

/* ─── regenerate_rate ────────────────────────────────────────── */
export async function computeRegenerateRate(
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<MetricResult> {
  const since = windowStart(windowDays);

  const { count: regens } = await supabaseAdmin
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("type", "video_regenerated")
    .gte("created_at", since);

  const { count: briefs } = await supabaseAdmin
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("type", "brief_submitted")
    .gte("created_at", since);

  const rate = (briefs ?? 0) === 0 ? 0 : (regens ?? 0) / (briefs ?? 1);

  return {
    metric_name: "regenerate_rate",
    value: rate,
    context: {
      window_days: windowDays,
      regenerations: regens ?? 0,
      briefs: briefs ?? 0,
    },
  };
}

/* ─── credit_efficiency ──────────────────────────────────────────
 * Engagement units per credit spent. Engagement = views+shares+downloads.
 */
export async function computeCreditEfficiency(
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<MetricResult> {
  const since = windowStart(windowDays);

  const { data: completedRenders } = await supabaseAdmin
    .from("renders")
    .select("credits_used")
    .eq("status", "complete")
    .gte("completed_at", since);

  const creditsSpent = (completedRenders ?? []).reduce(
    (sum, r) => sum + Number(r.credits_used ?? 0),
    0,
  );

  const { count: views } = await supabaseAdmin
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("type", "video_viewed")
    .gte("created_at", since);

  const { count: shares } = await supabaseAdmin
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("type", "video_shared")
    .gte("created_at", since);

  const { count: downloads } = await supabaseAdmin
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("type", "video_downloaded")
    .gte("created_at", since);

  const engagement = (views ?? 0) + (shares ?? 0) + (downloads ?? 0);
  const efficiency = creditsSpent === 0 ? 0 : engagement / creditsSpent;

  return {
    metric_name: "credit_efficiency",
    value: efficiency,
    context: {
      window_days: windowDays,
      credits_spent: creditsSpent,
      engagement,
      views: views ?? 0,
      shares: shares ?? 0,
      downloads: downloads ?? 0,
    },
  };
}

/* ─── viral_output_ratio ─────────────────────────────────────────
 * Fraction of completed renders whose viral_score exceeds threshold.
 */
export async function computeViralOutputRatio(
  threshold: number = 60,
  windowDays: number = 30,
): Promise<MetricResult> {
  const since = windowStart(windowDays);

  const { data: renders } = await supabaseAdmin
    .from("renders")
    .select("viral_score")
    .eq("status", "complete")
    .gte("completed_at", since);

  if (!renders || renders.length === 0) {
    return {
      metric_name: "viral_output_ratio",
      value: 0,
      context: { threshold, window_days: windowDays, sample_size: 0 },
    };
  }

  const viral = renders.filter((r) => Number(r.viral_score ?? 0) >= threshold).length;
  const ratio = viral / renders.length;

  return {
    metric_name: "viral_output_ratio",
    value: ratio,
    context: {
      threshold,
      window_days: windowDays,
      total: renders.length,
      viral,
    },
  };
}

/* ─── trend_direction helper ───────────────────────────────────── */
export async function detectTrendDirection(
  metric_name: string,
  current_value: number,
  driftEpsilon: number = 0.05,
): Promise<"up" | "down" | "flat"> {
  const { data: prior } = await supabaseAdmin
    .from("system_insights")
    .select("value")
    .eq("metric_name", metric_name)
    .order("created_at", { ascending: false })
    .limit(1);

  const priorValue = prior && prior[0] ? Number(prior[0].value) : null;
  if (priorValue === null || priorValue === 0) return "flat";

  const delta = (current_value - priorValue) / Math.abs(priorValue);
  if (delta > driftEpsilon) return "up";
  if (delta < -driftEpsilon) return "down";
  return "flat";
}
