/* GET /api/feature-flags
 *
 * Bootstrap endpoint — returns the flags currently enabled for the
 * authenticated user. Single round-trip; cache on the client.
 *
 * Auth required so user_id can drive deterministic bucket assignment.
 */

import { getUserAndPlan } from "../../../lib/auth";
import { listEnabledFlags } from "../../../lib/product-intel/feature-flags";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user } = await getUserAndPlan(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const flags = await listEnabledFlags(user.id);
  return Response.json({ flags });
}
