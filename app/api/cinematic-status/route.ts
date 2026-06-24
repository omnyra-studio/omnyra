/**
 * GET /api/cinematic-status?jobId=...
 * Frontend polls this during 60s async video generation.
 * Returns: { status, videoUrl?, sceneCount, estimatedSeconds }
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 10;

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) return Response.json({ error: "jobId required" }, { status: 400 });

  const { data: job, error } = await supabaseAdmin
    .from("kling_async_jobs")
    .select("id, user_id, status, scene_count, target_duration, video_url, error_msg, created_at, task_ids")
    .eq("id", jobId)
    .single();

  if (error || !job) return Response.json({ error: "Job not found" }, { status: 404 });
  if ((job as { user_id: string }).user_id !== user.id) return Response.json({ error: "Forbidden" }, { status: 403 });

  const taskIds = ((job as { task_ids: string[] }).task_ids) ?? [];
  const ageMs = Date.now() - new Date((job as { created_at: string }).created_at).getTime();
  const estimatedSeconds = Math.max(0, 240 - Math.floor(ageMs / 1000));

  return Response.json({
    status:          (job as { status: string }).status,
    videoUrl:        (job as { video_url: string | null }).video_url ?? null,
    errorMsg:        (job as { error_msg: string | null }).error_msg ?? null,
    sceneCount:      (job as { scene_count: number }).scene_count,
    targetDuration:  (job as { target_duration: number }).target_duration,
    submittedScenes: taskIds.length,
    estimatedSeconds,
  });
}
