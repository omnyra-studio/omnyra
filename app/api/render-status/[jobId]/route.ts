/**
 * GET /api/render-status/[jobId]
 *
 * Polling endpoint — returns current state of a render job.
 * Client polls every 5 seconds until status is 'completed' or 'failed'.
 *
 * Response shape:
 *   {
 *     jobId, status, progress,
 *     total_shots, completed_shots, failed_shots,
 *     video_url?,     // present when status === 'completed'
 *     error_message?, // present when status === 'failed'
 *     shots: [{ shot_id, shot_number, render_status, clip_url? }]
 *   }
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Fetch job ─────────────────────────────────────────────────────────────
  const { data: job, error: jobErr } = await supabase
    .from("render_jobs")
    .select("id, user_id, plan_id, status, total_shots, completed_shots, failed_shots, video_url, error_message, created_at, completed_at")
    .eq("id", jobId)
    .single();

  if (jobErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Fetch per-shot status ─────────────────────────────────────────────────
  const { data: shots } = await supabase
    .from("shots")
    .select("shot_id, shot_number, render_status, clip_url, render_error")
    .eq("shot_plan_id", job.plan_id)
    .order("shot_number", { ascending: true });

  const total = job.total_shots ?? 0;
  const done  = job.completed_shots ?? 0;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return NextResponse.json({
    jobId,
    status: job.status,
    progress,
    total_shots:     total,
    completed_shots: done,
    failed_shots:    job.failed_shots ?? 0,
    video_url:       job.video_url ?? undefined,
    error_message:   job.error_message ?? undefined,
    created_at:      job.created_at,
    completed_at:    job.completed_at ?? undefined,
    shots: shots ?? [],
  });
}
