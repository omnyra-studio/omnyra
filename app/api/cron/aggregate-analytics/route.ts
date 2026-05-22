/* GET /api/cron/aggregate-analytics
 *
 * Runs every 6h via Vercel Cron. Computes global / user / template
 * metrics and APPENDS to analytics_snapshots (never updates / never
 * deletes — historical snapshots are preserved).
 *
 * Dashboards and the revenue engine read analytics_snapshots — they
 * NEVER scan raw events. This is what makes the system scalable.
 */

import { runAnalyticsAggregation } from "../../../../lib/analytics/snapshots";

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
  const result = await runAnalyticsAggregation();
  return Response.json({ ok: true, result });
}
