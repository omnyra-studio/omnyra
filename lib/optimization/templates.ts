/* Template intelligence layer.
 *
 *   1. recomputeContentPerformance — rolls per-render content_scores
 *      into per-template content_performance, tracking velocity.
 *   2. getTrendingTemplates — ranked feed for the /api/templates/feed
 *      route.
 *   3. routeOnboardingTemplates — maps a user's stated goal to a
 *      template recommendation list, with fallback to data-driven top
 *      performers when goal is missing.
 */

import { supabaseAdmin } from "../supabase/admin";

const PERF_WINDOW_DAYS = 30;

interface PerfRow {
  template: string;
  hook_performance_score: number;
  avg_watch_time: number;
  completion_rate: number;
  shares: number;
  downloads: number;
  views: number;
  regenerate_rate: number;
  total_renders: number;
  completed_renders: number;
}

/**
 * Recompute the content_performance row for every template that has
 * any render in the window. Tracks score velocity vs the prior run
 * so the trending feed can sort by acceleration.
 */
export async function recomputeContentPerformance(): Promise<number> {
  const since = new Date(Date.now() - PERF_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Pull per-template render counts.
  const { data: stats } = await supabaseAdmin
    .from("renders")
    .select("template, status, viral_score, id")
    .gte("created_at", since)
    .not("template", "is", null);

  if (!stats) return 0;

  const groups = new Map<string, {
    total: number;
    completed: number;
    score_sum: number;
    score_count: number;
    render_ids: string[];
  }>();

  for (const row of stats as Array<{
    template: string | null;
    status: string | null;
    viral_score: number | null;
    id: string;
  }>) {
    if (!row.template) continue;
    const g = groups.get(row.template) ?? {
      total: 0,
      completed: 0,
      score_sum: 0,
      score_count: 0,
      render_ids: [],
    };
    g.total += 1;
    if (row.status === "complete") {
      g.completed += 1;
      g.score_sum += Number(row.viral_score ?? 0);
      g.score_count += 1;
      g.render_ids.push(row.id);
    }
    groups.set(row.template, g);
  }

  // For each template, also pull aggregate engagement events.
  let written = 0;
  for (const [template, g] of groups.entries()) {
    if (g.render_ids.length === 0) {
      // No completed renders → skip (would write zeros, drowning out signal)
      continue;
    }
    // Note: this query is bounded by render_ids count (typically dozens),
    // so the `.in()` is acceptable.
    const { data: engagementRows } = await supabaseAdmin
      .from("content_scores")
      .select("shares, downloads, views, completion_rate, watch_time_seconds")
      .in("render_id", g.render_ids);

    const eng = (engagementRows ?? []).reduce(
      (acc, r) => ({
        shares: acc.shares + Number(r.shares ?? 0),
        downloads: acc.downloads + Number(r.downloads ?? 0),
        views: acc.views + Number(r.views ?? 0),
        completion_sum: acc.completion_sum + Number(r.completion_rate ?? 0),
        watch_sum: acc.watch_sum + Number(r.watch_time_seconds ?? 0),
        n: acc.n + 1,
      }),
      { shares: 0, downloads: 0, views: 0, completion_sum: 0, watch_sum: 0, n: 0 },
    );

    const hook_performance_score = g.score_count > 0 ? g.score_sum / g.score_count : 0;
    const completion_rate = eng.n > 0 ? eng.completion_sum / eng.n : 0;
    const avg_watch_time = eng.n > 0 ? eng.watch_sum / eng.n : 0;

    // regenerate_rate = video_regenerated events on this template / briefs on this template
    const { count: regens } = await supabaseAdmin
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("type", "video_regenerated")
      .filter("payload->>template", "eq", template)
      .gte("created_at", since);

    const { count: briefs } = await supabaseAdmin
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("type", "brief_submitted")
      .filter("payload->>template", "eq", template)
      .gte("created_at", since);

    const regenerate_rate = (briefs ?? 0) === 0 ? 0 : (regens ?? 0) / (briefs ?? 1);

    // Fetch prior score for velocity.
    const { data: prior } = await supabaseAdmin
      .from("content_performance")
      .select("hook_performance_score")
      .eq("template", template)
      .maybeSingle();

    const prior_score = Number(prior?.hook_performance_score ?? 0);
    const velocity = hook_performance_score - prior_score;

    await supabaseAdmin.from("content_performance").upsert(
      {
        template,
        hook_performance_score,
        avg_watch_time,
        completion_rate,
        shares: eng.shares,
        downloads: eng.downloads,
        views: eng.views,
        regenerate_rate,
        total_renders: g.total,
        completed_renders: g.completed,
        viral_score_velocity: velocity,
        prior_score,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "template" },
    );
    written += 1;
  }

  return written;
}

/**
 * Read the trending feed sorted by recent score velocity, then absolute
 * score. Filters out templates flagged hidden.
 */
export async function getTrendingTemplates(limit: number = 20): Promise<PerfRow[]> {
  const { data: perfData } = await supabaseAdmin
    .from("content_performance")
    .select(
      "template, hook_performance_score, avg_watch_time, completion_rate, shares, downloads, views, regenerate_rate, total_renders, completed_renders, viral_score_velocity",
    )
    .order("viral_score_velocity", { ascending: false })
    .order("hook_performance_score", { ascending: false })
    .limit(limit * 2);

  if (!perfData || perfData.length === 0) return [];

  // Filter hidden templates in JS so we can drop in fewer round-trips.
  const templates = perfData.map((r) => r.template);
  const { data: settings } = await supabaseAdmin
    .from("template_settings")
    .select("template, visible")
    .in("template", templates);

  const hidden = new Set(
    (settings ?? []).filter((s) => s.visible === false).map((s) => s.template),
  );

  return perfData
    .filter((r) => !hidden.has(r.template))
    .slice(0, limit)
    .map((r) => ({
      template: String(r.template),
      hook_performance_score: Number(r.hook_performance_score ?? 0),
      avg_watch_time: Number(r.avg_watch_time ?? 0),
      completion_rate: Number(r.completion_rate ?? 0),
      shares: Number(r.shares ?? 0),
      downloads: Number(r.downloads ?? 0),
      views: Number(r.views ?? 0),
      regenerate_rate: Number(r.regenerate_rate ?? 0),
      total_renders: Number(r.total_renders ?? 0),
      completed_renders: Number(r.completed_renders ?? 0),
    }));
}

/**
 * Smart-onboarding routing: convert a user-stated goal into a ranked
 * list of templates to surface during onboarding. Pure function — does
 * not write anywhere. Falls back to top performers when the goal is
 * unknown.
 */
export interface OnboardingRoute {
  templates: string[];
  reason: string;
}

const GOAL_TEMPLATE_MAP: Record<string, string[]> = {
  "ugc_ads": ["ugc-ad", "product-launch"],
  "ugc": ["ugc-ad", "product-launch"],
  "personal_brand": ["influencer", "storytime"],
  "creator": ["influencer", "storytime"],
  "explore": ["faceless"],
  "exploring": ["faceless"],
  "just_exploring": ["faceless"],
};

export async function routeOnboardingTemplates(
  goal: string | null | undefined,
): Promise<OnboardingRoute> {
  const norm = (goal ?? "").toLowerCase().replace(/[^a-z_]/g, "_").trim();

  if (norm && GOAL_TEMPLATE_MAP[norm]) {
    return {
      templates: GOAL_TEMPLATE_MAP[norm],
      reason: `goal:${norm}`,
    };
  }

  // Fallback — data-driven top performers.
  const trending = await getTrendingTemplates(3);
  if (trending.length === 0) {
    // Cold-start: default to faceless (lowest-friction entry).
    return { templates: ["faceless"], reason: "cold_start_default" };
  }
  return {
    templates: trending.map((t) => t.template),
    reason: "data_driven_top_performers",
  };
}
