/**
 * GET /api/project/:id/status
 *
 * Polls render progress for a project.
 * Returns per-scene status + video URLs as they complete.
 * Client can poll every 5s until all scenes are complete.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const maxDuration = 10;

interface SceneRow {
  scene_id:       string;
  narrative_role: string;
  render_status:  string;
  image_url:      string | null;
  video_url:      string | null;
  model_used:     string | null;
  render_ms:      number | null;
  error_message:  string | null;
  priority:       number;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: scenes, error } = await supabase
    .from("scenes")
    .select("scene_id,narrative_role,render_status,image_url,video_url,model_used,render_ms,error_message,priority")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .order("priority", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (scenes ?? []) as SceneRow[];
  const total      = rows.length;
  const complete   = rows.filter(s => s.render_status === "complete").length;
  const failed     = rows.filter(s => s.render_status === "failed").length;
  const inProgress = rows.filter(s => ["queued", "rendering"].includes(s.render_status)).length;

  const allDone = total > 0 && complete + failed === total;

  return NextResponse.json({
    project_id: projectId,
    total,
    complete,
    failed,
    in_progress: inProgress,
    all_done:    allDone,
    scenes:      rows.map(s => ({
      scene_id:      s.scene_id,
      narrative_role: s.narrative_role,
      status:        s.render_status,
      image_url:     s.image_url,
      video_url:     s.video_url,
      model:         s.model_used,
      render_ms:     s.render_ms,
      error:         s.error_message,
    })),
  });
}
