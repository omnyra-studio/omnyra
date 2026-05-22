/* Personalisation engine.
 *
 * Two responsibilities:
 *   1. Compute user_profiles_extended rows from each user's render history.
 *   2. Predict viral_score for a planned render BEFORE it runs, so the
 *      UI can mark it "high potential" and the system can boost the
 *      template's visibility downstream.
 *
 * The virality predictor is intentionally simple — NO ML, just weighted
 * historical averages. Easy to reason about, deterministic, no external
 * dependency. Replace with a real model later if needed.
 */

import { supabaseAdmin } from "../supabase/admin";

const HISTORY_LIMIT = 50;

interface RenderRow {
  template: string | null;
  brief: { audience?: string } | null;
  director_settings: { energy?: string; camera?: string; style?: string } | null;
  viral_score: number | null;
  status: string | null;
}

/**
 * Recompute user_profiles_extended for a single user from their render
 * history. Idempotent — call as often as needed.
 */
export async function recomputeUserProfile(userId: string): Promise<void> {
  const { data: rows } = await supabaseAdmin
    .from("renders")
    .select("template, brief, director_settings, viral_score, status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  const renders = (rows as RenderRow[] | null) ?? [];
  if (renders.length === 0) {
    return;
  }

  const completed = renders.filter((r) => r.status === "complete");

  const templateCounts = new Map<string, { count: number; total_score: number }>();
  const audienceCounts = new Map<string, number>();
  const energyCounts = new Map<string, number>();
  const styleCounts = new Map<string, number>();

  for (const r of renders) {
    if (r.template) {
      const entry = templateCounts.get(r.template) ?? { count: 0, total_score: 0 };
      entry.count += 1;
      entry.total_score += Number(r.viral_score ?? 0);
      templateCounts.set(r.template, entry);
    }
    const aud = r.brief?.audience;
    if (aud) audienceCounts.set(aud, (audienceCounts.get(aud) ?? 0) + 1);
    const energy = r.director_settings?.energy;
    if (energy) energyCounts.set(energy, (energyCounts.get(energy) ?? 0) + 1);
    const style = r.director_settings?.style;
    if (style) styleCounts.set(style, (styleCounts.get(style) ?? 0) + 1);
  }

  function modeOf(m: Map<string, number>): string | null {
    let best: string | null = null;
    let bestN = 0;
    for (const [k, v] of m.entries()) {
      if (v > bestN) { best = k; bestN = v; }
    }
    return best;
  }

  // Best-performing template by avg viral_score (require ≥2 completions).
  let best_template: string | null = null;
  let best_template_score = 0;
  for (const [t, { count, total_score }] of templateCounts.entries()) {
    if (count >= 2) {
      const avg = total_score / count;
      if (avg > best_template_score) {
        best_template = t;
        best_template_score = avg;
      }
    }
  }

  const conversion_behavior = {
    total_renders: renders.length,
    completed: completed.length,
    completion_pct: renders.length ? completed.length / renders.length : 0,
    sample_size: renders.length,
  };

  const success_pattern = {
    best_template,
    best_template_avg_viral_score: best_template_score,
    dominant_template_uses: best_template
      ? templateCounts.get(best_template)?.count ?? 0
      : 0,
  };

  await supabaseAdmin
    .from("user_profiles_extended")
    .upsert(
      {
        user_id: userId,
        dominant_template_type: modeOf(new Map(
          [...templateCounts.entries()].map(([k, v]) => [k, v.count]),
        )),
        audience_type: modeOf(audienceCounts),
        preferred_energy_level: modeOf(energyCounts),
        avg_hook_style: modeOf(styleCounts),
        success_pattern,
        conversion_behavior,
        recomputed_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
}

/**
 * Recompute profiles for all users with recent activity. Called by the
 * AGS cron. Skips users without enough history.
 */
export async function recomputeAllUserProfiles(limitUsers: number = 1000): Promise<number> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: activeUsers } = await supabaseAdmin
    .from("renders")
    .select("user_id")
    .gte("created_at", since)
    .not("user_id", "is", null)
    .limit(10000);

  const userIds = Array.from(
    new Set((activeUsers ?? []).map((r) => r.user_id).filter(Boolean) as string[]),
  ).slice(0, limitUsers);

  let updated = 0;
  for (const id of userIds) {
    try {
      await recomputeUserProfile(id);
      updated += 1;
    } catch (err) {
      console.error("[personalization] recompute failed for", id, err);
    }
  }
  return updated;
}

/* ─── Virality predictor (no-ML) ──────────────────────────────────
 *
 *   predicted = 0.5 * template_history_avg
 *             + 0.3 * user_history_avg
 *             + 0.2 * audience_history_avg
 *
 * Clamped to 0..100. Each component falls back to a sensible default
 * when there's no history.
 */
export interface PredictInput {
  user_id: string;
  template: string;
  audience: string | null;
}

export async function predictViralScore(input: PredictInput): Promise<{
  predicted_viral_score: number;
  components: {
    template_avg: number;
    user_avg: number;
    audience_avg: number;
  };
}> {
  const sinceTemplate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sinceUser = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: templateRows },
    { data: userRows },
    { data: audienceRows },
  ] = await Promise.all([
    supabaseAdmin
      .from("renders")
      .select("viral_score")
      .eq("template", input.template)
      .eq("status", "complete")
      .gte("completed_at", sinceTemplate)
      .limit(500),
    supabaseAdmin
      .from("renders")
      .select("viral_score")
      .eq("user_id", input.user_id)
      .eq("status", "complete")
      .gte("completed_at", sinceUser)
      .limit(50),
    input.audience
      ? supabaseAdmin
          .from("renders")
          .select("viral_score")
          .eq("status", "complete")
          .filter("brief->>audience", "eq", input.audience)
          .gte("completed_at", sinceTemplate)
          .limit(500)
      : Promise.resolve({ data: [] as Array<{ viral_score: number | null }> }),
  ]);

  function avgOr(rows: Array<{ viral_score: number | null }>, fallback: number): number {
    const nums = rows.map((r) => Number(r.viral_score ?? 0)).filter(Number.isFinite);
    if (nums.length === 0) return fallback;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  // Fallbacks: if a component has no history, use 50 (neutral prior).
  const template_avg = avgOr(templateRows ?? [], 50);
  const user_avg = avgOr(userRows ?? [], 50);
  const audience_avg = avgOr(audienceRows ?? [], 50);

  const raw = 0.5 * template_avg + 0.3 * user_avg + 0.2 * audience_avg;
  const predicted_viral_score = Math.max(0, Math.min(100, Math.round(raw)));

  return {
    predicted_viral_score,
    components: { template_avg, user_avg, audience_avg },
  };
}
