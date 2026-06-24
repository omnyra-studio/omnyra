/**
 * GET /api/cron/kling-completion
 * Vercel cron — runs every 30 seconds.
 * Finds all kling_async_jobs with status='generating', polls each Kling task,
 * and when all tasks complete: stitches clips → merges audio → marks job done.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { pollKlingTaskOnce } from "@/lib/providers/kling-direct";
import { stitchClipsWithAudio, elevenLabsVoiceover } from "@/lib/services/elevenlabs";
import { saveRenderToLibrary } from "@/lib/renders/save-render";

export const maxDuration = 300;

interface AsyncJob {
  id: string;
  user_id: string;
  status: string;
  scene_count: number;
  target_duration: number;
  task_ids: string[];
  task_endpoints: string[];
  main_image_url: string | null;
  prompts: string[];
  audio_url: string | null;
  niche: string | null;
  credit_cost: number;
  created_at: string;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startMs = Date.now();
  console.log(`[KLING_CRON] starting at ${new Date().toISOString()}`);

  // Find jobs that are generating and less than 30 minutes old
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: jobs, error } = await supabaseAdmin
    .from("kling_async_jobs")
    .select("*")
    .eq("status", "generating")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(5);  // process up to 5 jobs per cron tick

  if (error) {
    console.error("[KLING_CRON] query error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!jobs || jobs.length === 0) {
    console.log("[KLING_CRON] no pending jobs");
    return Response.json({ processed: 0 });
  }

  console.log(`[KLING_CRON] found ${jobs.length} pending jobs`);

  let completed = 0;
  let failed = 0;
  let pending = 0;

  for (const job of jobs as AsyncJob[]) {
    if (Date.now() - startMs > 240_000) {
      console.log("[KLING_CRON] approaching time limit — stopping");
      break;
    }

    const taskIds       = job.task_ids ?? [];
    const taskEndpoints = job.task_endpoints ?? [];
    if (taskIds.length === 0) {
      await markFailed(job.id, "no task_ids");
      failed++;
      continue;
    }

    // Poll each task once
    const results = await Promise.all(
      taskIds.map((taskId, i) =>
        pollKlingTaskOnce(taskId, taskEndpoints[i] ?? "/v1/videos/image2video")
          .catch(err => ({ status: "unknown", videoUrl: undefined, error: String(err) }))
      )
    );

    const statuses = results.map(r => r.status);
    console.log(`[KLING_CRON] job=${job.id} statuses=${statuses.join(",")}`);

    // If any failed permanently
    const hasFailed = results.some(r => r.status === "failed" || r.status === "error");
    if (hasFailed) {
      await markFailed(job.id, "one or more Kling tasks failed");
      failed++;
      continue;
    }

    // If any still processing
    const allDone = results.every(r => r.status === "succeed" || r.status === "completed");
    if (!allDone) {
      pending++;
      continue;
    }

    // All tasks complete — collect clip URLs
    const clipUrls = results.map(r => r.videoUrl).filter((u): u is string => !!u);
    if (clipUrls.length < taskIds.length) {
      await markFailed(job.id, "missing video URLs despite succeed status");
      failed++;
      continue;
    }

    // Mark as stitching
    await supabaseAdmin.from("kling_async_jobs").update({ status: "stitching", updated_at: new Date().toISOString() }).eq("id", job.id);

    try {
      // Stitch clips with audio
      const stitchedUrl = await stitchClipsWithAudio({
        clipUrls,
        audioUrl:    job.audio_url ?? undefined,
        userId:      job.user_id,
        maxDuration: job.target_duration,
      });

      // Save to renders library
      await saveRenderToLibrary({
        userId:   job.user_id,
        videoUrl: stitchedUrl,
        niche:    job.niche ?? undefined,
        template: "cinematic-60s",
      });

      // Mark complete
      await supabaseAdmin.from("kling_async_jobs").update({
        status:       "complete",
        video_url:    stitchedUrl,
        updated_at:   new Date().toISOString(),
      }).eq("id", job.id);

      console.log(`[KLING_CRON] job=${job.id} complete url=${stitchedUrl.substring(0, 80)}`);
      completed++;
    } catch (stitchErr) {
      const msg = stitchErr instanceof Error ? stitchErr.message : String(stitchErr);
      console.error(`[KLING_CRON] stitch failed job=${job.id}:`, msg);
      await markFailed(job.id, `stitch failed: ${msg}`);
      failed++;
    }
  }

  console.log(`[KLING_CRON] done elapsed=${Date.now() - startMs}ms completed=${completed} failed=${failed} pending=${pending}`);
  return Response.json({ completed, failed, pending });
}

async function markFailed(jobId: string, reason: string) {
  await supabaseAdmin.from("kling_async_jobs").update({
    status:     "failed",
    error_msg:  reason,
    updated_at: new Date().toISOString(),
  }).eq("id", jobId);
  console.error(`[KLING_CRON] job=${jobId} failed: ${reason}`);
}
