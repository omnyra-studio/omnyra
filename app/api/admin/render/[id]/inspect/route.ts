/* GET /api/admin/render/[id]/inspect
 *
 * Admin diagnostics for a single render. Returns:
 *   - event timeline (render_events)
 *   - job timeline (render_pipeline_jobs) with status + provider + duration
 *   - per-stage timings (render_stage_timings view)
 *   - derived UI state (render_state_derived view)
 *
 * Use this to debug "why was this render slow?" and "where did it fail?".
 *
 * Auth: only users in OMNYRA_ADMIN_USER_IDS (comma-separated env var)
 * are allowed. Falls back to "owner-of-the-render OR admin" so engineers
 * can debug their own test runs without being in the admin list.
 */

import { getUserAndPlan } from "../../../../../../lib/auth";
import { supabaseAdmin } from "../../../../../../lib/supabase/admin";
import { loadRenderState } from "../../../../../../lib/pipeline/state";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function isAdmin(userId: string): boolean {
  const list = (process.env.OMNYRA_ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(userId);
}

export async function GET(request: Request, { params }: RouteContext) {
  const { user } = await getUserAndPlan(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id: renderId } = await params;
  if (!renderId) return Response.json({ error: "invalid_render_id" }, { status: 400 });

  // Verify either ownership or admin status.
  const snapshot = await loadRenderState(renderId, isAdmin(user.id) ? {} : { user_id: user.id });
  if (!snapshot) {
    return Response.json({ error: "not_found_or_forbidden" }, { status: 404 });
  }

  const [{ data: jobs }, { data: timings }] = await Promise.all([
    supabaseAdmin
      .from("render_pipeline_jobs")
      .select("id, step, status, provider, attempt, started_at, completed_at, error_message, context")
      .eq("render_id", renderId)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("render_stage_timings")
      .select("stage_started, stage_completed, duration")
      .eq("render_id", renderId),
  ]);

  // Compute slowest stage.
  type Timing = { stage_started: string; stage_completed: string; duration: string };
  const timingRows = (timings ?? []) as Timing[];
  let slowest: { stage: string; seconds: number } | null = null;
  for (const t of timingRows) {
    // duration is a Postgres interval — supabase returns it as ISO 8601
    // (e.g. "00:01:23") or a number depending on driver. Parse defensively.
    const raw = String(t.duration ?? "");
    const m = raw.match(/(\d+):(\d+):(\d+)(?:\.(\d+))?/);
    let seconds = 0;
    if (m) {
      seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    } else {
      // numeric seconds fallback
      const n = Number(raw);
      if (Number.isFinite(n)) seconds = n;
    }
    if (!slowest || seconds > slowest.seconds) {
      slowest = { stage: `${t.stage_started} → ${t.stage_completed}`, seconds };
    }
  }

  return Response.json({
    ok: true,
    snapshot: {
      render_id: snapshot.render_id,
      derived_status: snapshot.derived_status,
      ui_stage: snapshot.ui_stage,
      video_url: snapshot.video_url,
      error_message: snapshot.error_message,
    },
    events: snapshot.events,
    jobs: jobs ?? [],
    timings: timingRows,
    slowest_stage: slowest,
  });
}
