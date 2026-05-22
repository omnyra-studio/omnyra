/* GET /api/renders/[id]/events
 *
 * Resumability endpoint — per spec §6 ("STATE IS REBUILT, not stored").
 *
 * Returns the full event timeline for a render plus a normalised
 * `state` snapshot (derived from the latest event). The client can
 * refresh /create at any time, pull this once, and render the UI in
 * the correct stage without any local pipeline state.
 *
 * Auth required; enforces ownership before returning events.
 */

import { getUserAndPlan } from "../../../../../lib/auth";
import { loadRenderState } from "../../../../../lib/pipeline/state";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteContext) {
  const { user } = await getUserAndPlan(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id: renderId } = await params;
  if (!renderId) return Response.json({ error: "invalid_render_id" }, { status: 400 });

  const snapshot = await loadRenderState(renderId, { user_id: user.id });
  if (!snapshot) return Response.json({ error: "not_found_or_forbidden" }, { status: 404 });

  return Response.json({ ok: true, state: snapshot });
}
