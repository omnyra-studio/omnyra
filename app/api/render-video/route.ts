/**
 * POST /api/render-video
 *
 * Render Router — the orchestrator for the full video production pipeline.
 *
 * Flow:
 *   1. Validate auth + body { planId, voiceoverUrl, avatarId?, voiceId? }
 *   2. Load shot packets from Supabase (shots table)
 *   3. Create a render_job row (status: queued)
 *   4. Fan out shot execution in parallel via executeShot()
 *   5. Update each shot's status as it completes
 *   6. When all shots done, kick off composeVideo()
 *   7. Update render_job with final video URL
 *
 * The route returns immediately with { jobId } — client polls /api/render-status/[jobId].
 * Actual rendering runs in the background (Vercel Fluid Compute, up to 300s).
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { executeShot } from "../../../lib/shot-executor";
import { composeVideo } from "../../../lib/composer";
import type { ShotPacket } from "../../../lib/types/shot";

export const maxDuration = 300; // Vercel Fluid Compute max

export async function POST(request: Request) {
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

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: {
    planId: string;
    voiceoverUrl: string;
    avatarId?: string;
    voiceId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { planId, voiceoverUrl = "", avatarId, voiceId } = body;
  if (!planId?.trim()) {
    return NextResponse.json(
      { error: "Missing required field: planId" },
      { status: 400 },
    );
  }

  // ── Load shot packets ─────────────────────────────────────────────────────
  const { data: shots, error: shotsErr } = await supabase
    .from("shots")
    .select("*")
    .eq("shot_plan_id", planId)
    .order("shot_number", { ascending: true });

  if (shotsErr || !shots?.length) {
    return NextResponse.json({ error: "No shots found for this plan" }, { status: 404 });
  }

  // ── Create render job ─────────────────────────────────────────────────────
  const { data: job, error: jobErr } = await supabase
    .from("render_jobs")
    .insert({
      user_id: user.id,
      plan_id: planId,
      status: "queued",
      total_shots: shots.length,
      completed_shots: 0,
      failed_shots: 0,
      voiceover_url: voiceoverUrl,
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    return NextResponse.json({ error: jobErr?.message ?? "Failed to create render job" }, { status: 500 });
  }

  const jobId = job.id as string;

  // ── Return jobId immediately, render in background ────────────────────────
  // Vercel runs the promise after the response for up to maxDuration seconds.
  void runRenderPipeline(supabase, jobId, shots as ShotPacket[], voiceoverUrl, { avatarId, voiceId });

  return NextResponse.json({ jobId, status: "queued", total_shots: shots.length });
}

// ── Background render pipeline ────────────────────────────────────────────────

async function runRenderPipeline(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  jobId: string,
  shots: ShotPacket[],
  voiceoverUrl: string,
  assets: { avatarId?: string; voiceId?: string },
) {
  try {
    await supabase
      .from("render_jobs")
      .update({ status: "rendering" })
      .eq("id", jobId);

    // ── Execute shots in parallel, max 4 concurrent ─────────────────────────
    const shotClips = new Map<string, string>();
    const CONCURRENCY = 4;

    for (let i = 0; i < shots.length; i += CONCURRENCY) {
      const batch = shots.slice(i, i + CONCURRENCY);

      const results = await Promise.allSettled(
        batch.map(shot => executeShot(shot, assets)),
      );

      let completedDelta = 0;
      let failedDelta = 0;

      for (let j = 0; j < batch.length; j++) {
        const shot = batch[j];
        const result = results[j];

        if (result.status === "fulfilled" && result.value) {
          shotClips.set(shot.shot_id, result.value.videoUrl);
          completedDelta++;

          // Persist clip URL to shots table
          await supabase
            .from("shots")
            .update({ clip_url: result.value.videoUrl, render_status: "completed" })
            .eq("shot_id", shot.shot_id)
            .eq("shot_plan_id", shots[0]?.shot_id ? undefined : shot.shot_id);
        } else {
          const reason = result.status === "rejected"
            ? (result.reason instanceof Error ? result.reason.message : String(result.reason))
            : "executeShot returned null";
          console.error(`[render-video] shot ${shot.shot_id} failed: ${reason}`);
          failedDelta++;

          await supabase
            .from("shots")
            .update({ render_status: "failed", render_error: reason })
            .eq("shot_id", shot.shot_id);
        }
      }

      // Progress update
      await supabase.rpc("increment_render_job_progress", {
        p_job_id: jobId,
        p_completed: completedDelta,
        p_failed: failedDelta,
      });
    }

    if (shotClips.size === 0) {
      throw new Error("All shots failed — cannot compose");
    }

    // ── Download voiceover to /tmp (optional) ───────────────────────────────
    const os = await import("node:os");
    const path = await import("node:path");
    let voiceoverLocal = "";
    if (voiceoverUrl?.trim()) {
      voiceoverLocal = path.join(os.tmpdir(), `vo_${jobId}.mp3`);
      await downloadToTemp(voiceoverUrl, voiceoverLocal);
    }

    // ── Compose ──────────────────────────────────────────────────────────────
    await supabase
      .from("render_jobs")
      .update({ status: "composing" })
      .eq("id", jobId);

    const finalPath = await composeVideo(shots, shotClips, voiceoverLocal);

    // ── Upload final video to Supabase Storage ────────────────────────────────
    const fs = await import("node:fs");
    const videoBuffer = fs.readFileSync(finalPath);
    const storagePath = `renders/${jobId}/final.mp4`;

    const { error: uploadErr } = await supabase.storage
      .from("videos")
      .upload(storagePath, videoBuffer, { contentType: "video/mp4", upsert: true });

    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

    const { data: { publicUrl } } = supabase.storage
      .from("videos")
      .getPublicUrl(storagePath);

    // Cleanup voiceover temp file
    if (voiceoverLocal) try { fs.unlinkSync(voiceoverLocal); } catch { /* non-fatal */ }
    try { fs.unlinkSync(finalPath); } catch { /* non-fatal */ }

    await supabase
      .from("render_jobs")
      .update({
        status: "completed",
        video_url: publicUrl,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    console.log(`[render-video] job ${jobId} complete: ${publicUrl}`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[render-video] job ${jobId} fatal error:`, msg);

    await supabase
      .from("render_jobs")
      .update({ status: "failed", error_message: msg })
      .eq("id", jobId);
  }
}

async function downloadToTemp(url: string, dest: string): Promise<void> {
  const https = await import("node:https");
  const http  = await import("node:http");
  const fs    = await import("node:fs");

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get  = url.startsWith("https://") ? https.get : http.get;
    get(url, (res) => {
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
    }).on("error", reject);
  });
}
