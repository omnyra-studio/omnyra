/* GET /api/cron/company-strategy
 *
 * Daily run of the autonomous strategy engine.
 *
 *   1. Promote high-impact tactical insights into company_memory.
 *   2. Generate strategic_actions from current state.
 *   3. Sync those actions into roadmap_items (insert / refresh scores).
 *   4. Append each generated action as a company_memory entry.
 *
 * Distribution / shipping / Stripe / pricing is NOT mutated here.
 * The output is recommendations; humans approve before action.
 */

import { promoteSystemInsights, writeMemory } from "../../../../lib/strategy/company-memory";
import { generateStrategicActions, syncRoadmap } from "../../../../lib/strategy/strategic-actions";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  // 1. Promote tactical insights → long-term memory.
  const promoted = await promoteSystemInsights(24);

  // 2 + 3. Generate strategic actions and sync into roadmap.
  const actions = await generateStrategicActions();
  const roadmapSync = await syncRoadmap(actions);

  // 4. Each action becomes a memory entry so we can track WHY decisions
  //    were made over time.
  for (const a of actions) {
    await writeMemory({
      category: a.category,
      insight: `${a.action} — ${a.reason}`,
      confidence_score: 70,
      impact_score: Math.min(100, a.expected_revenue_impact_pct * 5),
      source_metrics: a.source_metrics,
    });
  }

  return Response.json({
    ok: true,
    promoted_insights: promoted,
    actions_generated: actions.length,
    roadmap: roadmapSync,
    duration_ms: Date.now() - started,
    actions,
  });
}
