/* GET /api/templates/feed
 *
 * Public trending feed. Returns templates sorted by viral_score_velocity
 * then absolute hook_performance_score, filtered to visible templates.
 *
 *   ?limit=20  (default 20, max 50)
 *   ?goal=ugc  (optional — if provided, prepends goal-routed templates
 *               and de-dups with the trending list)
 *
 * No auth required — the feed is shaped by aggregate data, not user
 * identity. Per-user personalisation lives at /api/templates/recommended
 * (gated by Bearer token).
 */

import {
  getTrendingTemplates,
  routeOnboardingTemplates,
} from "../../../../lib/optimization/templates";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? "20");
  const limit = Math.max(1, Math.min(50, Number.isFinite(limitParam) ? limitParam : 20));
  const goal = url.searchParams.get("goal");

  const trending = await getTrendingTemplates(limit);

  let prefix: string[] = [];
  let reason = "trending";
  if (goal) {
    const routed = await routeOnboardingTemplates(goal);
    prefix = routed.templates;
    reason = routed.reason;
  }

  const seen = new Set<string>();
  const ordered: typeof trending = [];

  // Prefix the goal-routed templates if we have aggregate data for them.
  for (const t of prefix) {
    const match = trending.find((row) => row.template === t);
    if (match && !seen.has(t)) {
      ordered.push(match);
      seen.add(t);
    }
  }
  for (const row of trending) {
    if (seen.has(row.template)) continue;
    ordered.push(row);
    seen.add(row.template);
  }

  return Response.json({
    templates: ordered.slice(0, limit),
    routing: { goal: goal ?? null, reason },
  });
}
