/* GET /api/templates/recommended
 *
 * Per-user template recommendations. Authenticated.
 *
 *   1. Read user_profiles_extended.success_pattern → user's best template
 *   2. Read .dominant_template_type → user's most-used template
 *   3. Surface these first, then fill with the global trending feed
 *      (de-duplicated).
 *
 * Returns the same shape as /api/templates/feed plus a `recommendation`
 * field per row indicating why it's there ("user_best" / "user_dominant"
 * / "trending").
 */

import { getUserAndPlan } from "../../../../lib/auth";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { getTrendingTemplates } from "../../../../lib/optimization/templates";

export const dynamic = "force-dynamic";

interface ProfileRow {
  dominant_template_type: string | null;
  success_pattern: { best_template?: string | null } | null;
  preferred_energy_level: string | null;
}

export async function GET(request: Request) {
  const { user } = await getUserAndPlan(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(20, Number(url.searchParams.get("limit") ?? "10")));

  const { data: profile } = await supabaseAdmin
    .from("user_profiles_extended")
    .select("dominant_template_type, success_pattern, preferred_energy_level")
    .eq("user_id", user.id)
    .maybeSingle();

  const p = (profile as ProfileRow | null) ?? null;
  const personalOrder: Array<{ template: string; reason: string }> = [];

  const best = p?.success_pattern?.best_template;
  if (best) personalOrder.push({ template: best, reason: "user_best" });

  if (p?.dominant_template_type && p.dominant_template_type !== best) {
    personalOrder.push({ template: p.dominant_template_type, reason: "user_dominant" });
  }

  // Pull trending so we have aggregate data for ranking + fallback.
  const trending = await getTrendingTemplates(limit + personalOrder.length);

  const byTemplate = new Map(trending.map((t) => [t.template, t]));

  type Row = (typeof trending)[number] & { recommendation: string };
  const out: Row[] = [];
  const seen = new Set<string>();

  for (const { template, reason } of personalOrder) {
    const stats = byTemplate.get(template);
    if (stats) {
      out.push({ ...stats, recommendation: reason });
      seen.add(template);
    } else {
      // We have no aggregate row — surface a zeroed stub so the client
      // can still render the recommendation.
      out.push({
        template,
        hook_performance_score: 0,
        avg_watch_time: 0,
        completion_rate: 0,
        shares: 0,
        downloads: 0,
        views: 0,
        regenerate_rate: 0,
        total_renders: 0,
        completed_renders: 0,
        recommendation: reason,
      });
      seen.add(template);
    }
  }

  for (const t of trending) {
    if (seen.has(t.template)) continue;
    out.push({ ...t, recommendation: "trending" });
    seen.add(t.template);
    if (out.length >= limit) break;
  }

  return Response.json({
    templates: out.slice(0, limit),
    profile_signal: {
      has_profile: Boolean(p),
      preferred_energy: p?.preferred_energy_level ?? null,
    },
  });
}
