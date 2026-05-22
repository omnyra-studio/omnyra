/* GET /api/cron/generate-marketing-assets
 *
 * Daily generation of marketing copy seeded from top-performing
 * templates. Calls the Anthropic API once per asset type per template.
 *
 * Output lands in `marketing_assets` with status='draft'. NO automatic
 * distribution — per spec §7 "no autonomous spam, no auto-DM, no
 * auto-publish". A human flips status to 'approved' / 'published' via
 * an admin tool (not yet built).
 */

import { generateAllAssets } from "../../../../lib/marketing/asset-generator";

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
  const result = await generateAllAssets();
  return Response.json({
    ok: result.failed === 0,
    duration_ms: Date.now() - started,
    ...result,
  });
}
