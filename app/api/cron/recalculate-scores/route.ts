/* GET /api/cron/recalculate-scores
 *
 * Batch scoring job — runs every 15 minutes via Vercel Cron.
 *
 * The job is the SOLE writer of:
 *   - content_scores  (per-render viral score)
 *   - template_scores (per-template aggregates)
 *   - user_scores     (per-user aggregates)
 *
 * SPEC GUARANTEE (from "Automated Scoring System" rules):
 *   1. NEVER update scores inside API requests.
 *   2. ALL scoring is batch processed.
 *   3. JOB IS IDEMPOTENT — every recalculator UPSERTs only.
 *   4. Re-running does NOT duplicate results.
 *
 * Cron security: if CRON_SECRET is set, require Bearer match.
 */

import { runBatchScoring } from "../../../../lib/optimization/scoring";

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

  const result = await runBatchScoring(30);
  return Response.json({ ok: result.errors.length === 0, result });
}
