/**
 * GET /api/snapshots/[projectId]
 * Returns the ordered snapshot timeline for a project.
 * Used by the Snapshot Replay debug UI (future) and Auto-Healing Worker.
 *
 * Query: ?v=2  — return only snapshot at version 2
 *        ?diff=1&v2=2 — diff version 1 vs version 2
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  getProjectTimeline,
  replayScene,
  diffScenes,
} from "@/lib/services/snapshot-replay";

export const maxDuration = 30;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Only allow users to query their own project timelines
  // project_id = user_id for cinematic jobs (set at snapshot save time)
  if (projectId !== user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url    = new URL(_req.url);
  const v      = url.searchParams.get("v");
  const diffV2 = url.searchParams.get("v2");

  try {
    // ?v=N&v2=M — diff two snapshots
    if (v && diffV2) {
      const diff = await diffScenes(projectId, Number(v), Number(diffV2));
      if (!diff) return Response.json({ error: "Snapshots not found" }, { status: 404 });
      return Response.json({ diff });
    }

    // ?v=N — single snapshot replay
    if (v) {
      const snapshot = await replayScene(projectId, Number(v));
      if (!snapshot) return Response.json({ error: "Snapshot not found" }, { status: 404 });
      return Response.json({ snapshot });
    }

    // No params — full timeline
    const timeline = await getProjectTimeline(projectId);
    return Response.json({ timeline, count: timeline.length });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
