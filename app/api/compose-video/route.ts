/**
 * POST /api/compose-video
 *
 * Assembles executed shot clips + voiceover into a final video by calling the
 * omnyra-composer FFmpeg microservice on Railway/Render.
 *
 * Pre-conditions (caller's responsibility):
 *   - All shots for the plan have been executed — each row in `shots` table
 *     has a non-null `clip_url` and `render_status = 'completed'`
 *   - A voiceover has been generated and is reachable at a URL
 *
 * Flow:
 *   1. Auth + parse body { projectId, shotPlanId?, voiceoverUrl? }
 *   2. Load shots from DB, ordered by shot_number
 *   3. Resolve voiceover URL (from body, or latest render_job, or renders table)
 *   4. Download clips + voiceover into memory as Blobs
 *   5. POST multipart/form-data to composer microservice
 *   6. Download composed video from composer
 *   7. Upload final MP4 to Supabase Storage (renders bucket)
 *   8. Update render_jobs row → completed + video_url
 *   9. Return { success, video_url, duration_seconds }
 *
 * Env vars required:
 *   COMPOSER_SERVICE_URL   e.g. https://omnyra-composer.up.railway.app
 *   COMPOSER_API_KEY       same value set on the microservice
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import { tmpdir } from "os";
import { join } from "path";
import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { randomUUID } from "crypto";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
import { buildRenderContract, assertContractRenderable, RenderContractError, type ShotAssetInput, type ValidRenderContract } from "@/lib/timeline/build-contract";
import { rebuildRender } from "@/lib/render/incremental-engine";
import { processShardJob } from "@/lib/workers/shard-worker";
import { getShardCache } from "@/lib/render/shard-cache";
import { mergeShards } from "@/lib/render/merge";
import type { RenderShard, MergeResult } from "@/lib/render/types";
import type { WorkerResult } from "@/lib/workers/types";

export const maxDuration = 300; // Vercel Fluid Compute — 5 minute ceiling

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShotRow {
  shot_id: string;
  shot_number: number;
  duration_seconds: number;
  energy_curve: string;
  transition_in: string | null;
  transition_after: string | null;
  transition_duration: number | null;
  zoom_effect: boolean | null;
  clip_url: string | null;
  render_status: string | null;
}

interface ComposeBody {
  projectId?: string;     // required for shot-plan mode; omit for single-clip mode
  shotPlanId?: string;
  voiceoverUrl?: string;  // optional — route will look it up in DB if absent
  videoUrl?: string;      // single-clip mode: skip DB shot lookup, use URL directly
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchBlob(url: string, label: string): Promise<Blob> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to download ${label}: HTTP ${res.status} — ${url}`);
  }
  return res.blob();
}

// Wraps fetch with an AbortController timeout so the overall route stays within
// Vercel's maxDuration. 120 s for composition is generous — adjust if needed.
function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(id));
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ───────────────────────────────────────────────────────────────
  let body: ComposeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { projectId, shotPlanId, voiceoverUrl: bodyVoiceoverUrl } = body;

  // ── Single-clip mode — checked FIRST, no projectId required ─────────────────
  // Used by the cinematic preview flow: { videoUrl, voiceoverUrl? }
  // Uses local FFmpeg when COMPOSER_SERVICE_URL is absent (always works in dev/prod).
  // Falls back to external composer when COMPOSER_SERVICE_URL is configured.
  if (body.videoUrl?.trim()) {
    const singleClipUrl = body.videoUrl.trim();
    const singleVoiceUrl = body.voiceoverUrl?.trim() ?? null;

    console.log(`[compose-video:single] videoUrl=${singleClipUrl.substring(0, 80)}, hasVoiceover=${!!singleVoiceUrl}`);

    const composerUrl = process.env.COMPOSER_SERVICE_URL;
    const composerKey = process.env.COMPOSER_API_KEY;

    if (composerUrl) {
      // External composer path
      let clipBlob: Blob;
      let voiceBlob: Blob | null = null;
      try {
        clipBlob = await fetchBlob(singleClipUrl, "single clip");
        if (singleVoiceUrl) voiceBlob = await fetchBlob(singleVoiceUrl, "voiceover");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to download media";
        return NextResponse.json({ success: false, error: msg }, { status: 502 });
      }

      const form = new FormData();
      form.append("clips", clipBlob!, "shot_1.mp4");
      if (voiceBlob) form.append("voiceover", voiceBlob, "voiceover.mp3");
      form.append("shot_plan", JSON.stringify({
        shots: [{ duration: 8, energy_curve: "sustain", transition_in: "hard_cut", transition_duration: 0, zoom_effect: false }],
      }));

      let composeRes: Response;
      try {
        composeRes = await fetchWithTimeout(
          `${composerUrl}/compose`,
          { method: "POST", headers: { "x-api-key": composerKey ?? "" }, body: form },
          120_000,
        );
      } catch (err) {
        const isTimeout = err instanceof Error && err.name === "AbortError";
        return NextResponse.json(
          { success: false, error: isTimeout ? "Composition timed out" : "Composer unavailable" },
          { status: 504 },
        );
      }

      if (!composeRes.ok) {
        let msg = `Composer HTTP ${composeRes.status}`;
        try { const b = await composeRes.json() as { error?: string }; if (b.error) msg = b.error; } catch { /* ignore */ }
        return NextResponse.json({ success: false, error: msg }, { status: 502 });
      }

      const composeResult = await composeRes.json() as { success: boolean; video_url: string; error?: string };
      if (!composeResult.success || !composeResult.video_url) {
        return NextResponse.json({ success: false, error: composeResult.error ?? "Compose failed" }, { status: 500 });
      }

      const composedVideoBlob = await fetchBlob(
        composeResult.video_url.startsWith("http") ? composeResult.video_url : `${composerUrl}${composeResult.video_url}`,
        "composed video",
      );
      const storagePath = `renders/${user.id}/${Date.now()}/preview.mp4`;
      const { error: uploadErr } = await supabase.storage
        .from("videos")
        .upload(storagePath, await composedVideoBlob.arrayBuffer(), { contentType: "video/mp4", upsert: true });

      if (uploadErr) {
        console.error("[compose-video:single] Storage upload failed:", uploadErr.message);
        return NextResponse.json({ success: false, error: "Assembled but storage upload failed" }, { status: 500 });
      }

      const { data: { publicUrl } } = supabase.storage.from("videos").getPublicUrl(storagePath);
      return NextResponse.json({ success: true, video_url: publicUrl, has_audio: !!voiceBlob });

    } else {
      // Local FFmpeg path — works without COMPOSER_SERVICE_URL
      console.log("[compose-video:single] COMPOSER_SERVICE_URL absent — using local FFmpeg");
      const id = randomUUID();
      const tmpDir = tmpdir();
      const videoPath = join(tmpDir, `cv-video-${id}.mp4`);
      const audioPath = join(tmpDir, `cv-audio-${id}.mp3`);
      const outputPath = join(tmpDir, `cv-output-${id}.mp4`);
      const paths = [videoPath, audioPath, outputPath];

      try {
        const videoRes = await fetch(singleClipUrl);
        if (!videoRes.ok) throw new Error(`Failed to fetch video: ${videoRes.status}`);
        writeFileSync(videoPath, Buffer.from(await videoRes.arrayBuffer()));

        if (singleVoiceUrl) {
          const audioRes = await fetch(singleVoiceUrl);
          if (!audioRes.ok) throw new Error(`Failed to fetch audio: ${audioRes.status}`);
          writeFileSync(audioPath, Buffer.from(await audioRes.arrayBuffer()));

          await new Promise<void>((resolve, reject) => {
            ffmpeg()
              .input(videoPath)
              .input(audioPath)
              .outputOptions(["-c:v", "copy", "-c:a", "aac", "-map", "0:v:0", "-map", "1:a:0"])
              .output(outputPath)
              .on("end", () => resolve())
              .on("error", (err: Error) => reject(err))
              .run();
          });
        } else {
          // No audio — just copy the video
          writeFileSync(outputPath, readFileSync(videoPath));
        }

        const videoBuffer = readFileSync(outputPath);
        const storagePath = `renders/${user.id}/${Date.now()}/preview.mp4`;
        const { error: uploadErr } = await supabase.storage
          .from("videos")
          .upload(storagePath, videoBuffer, { contentType: "video/mp4", upsert: true });

        if (uploadErr) {
          console.error("[compose-video:single:local] Storage upload failed:", uploadErr.message);
          return NextResponse.json({ success: false, error: "Assembled but storage upload failed" }, { status: 500 });
        }

        const { data: { publicUrl } } = supabase.storage.from("videos").getPublicUrl(storagePath);
        return NextResponse.json({ success: true, video_url: publicUrl, has_audio: !!singleVoiceUrl });

      } catch (err) {
        const msg = err instanceof Error ? err.message : "Local compose failed";
        console.error("[compose-video:single:local]", msg);
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
      } finally {
        for (const p of paths) { try { unlinkSync(p); } catch { /* already gone */ } }
      }
    }
  }

  // ── Multi-clip (shot-plan) mode — projectId required ────────────────────────
  if (!projectId?.trim()) {
    return NextResponse.json({ success: false, error: "Missing required field: projectId" }, { status: 400 });
  }

  // ── Validate environment ──────────────────────────────────────────────────────
  const composerUrl = process.env.COMPOSER_SERVICE_URL;
  const composerKey = process.env.COMPOSER_API_KEY;

  if (!composerUrl) {
    console.error("[compose-video] COMPOSER_SERVICE_URL not configured");
    return NextResponse.json(
      { success: false, error: "Video assembly service is not configured. Please contact support." },
      { status: 503 },
    );
  }

  // ── Load shots (no DB ordering — compile stage owns ordering) ────────────
  // Intentionally no .order() here. Shot_number ordering is the compiler's
  // responsibility, not the DB query's. Any DB sort is an ordering side-channel
  // that can diverge from the compiled timeline.
  let shotsQuery = supabase
    .from("shots")
    .select(
      "shot_id, shot_number, duration_seconds, energy_curve, transition_in, " +
      "transition_after, transition_duration, zoom_effect, clip_url, render_status",
    );

  if (shotPlanId) {
    shotsQuery = shotsQuery.eq("shot_plan_id", shotPlanId);
  } else {
    shotsQuery = shotsQuery.eq("project_id", projectId);
  }

  const { data: shots, error: shotsErr } = await shotsQuery;

  if (shotsErr) {
    console.error("[compose-video] DB error loading shots:", shotsErr.message);
    return NextResponse.json({ success: false, error: "Failed to load shot plan" }, { status: 500 });
  }

  if (!shots?.length) {
    return NextResponse.json(
      { success: false, error: "No shots found for this project. Run shot generation first." },
      { status: 404 },
    );
  }

  // No runtime filtering here. The compiler rejects incomplete assets explicitly.
  // Partial graphs must not render — a missing clip is a compile error, not a warning.

  // ── Resolve voiceover URL ─────────────────────────────────────────────────
  let voiceoverUrl = bodyVoiceoverUrl?.trim() ?? null;

  if (!voiceoverUrl && shotPlanId) {
    const { data: planRow } = await supabase
      .from("shot_plans")
      .select("voiceover_url")
      .eq("id", shotPlanId)
      .single();
    if (planRow?.voiceover_url) voiceoverUrl = planRow.voiceover_url as string;
  }

  if (!voiceoverUrl) {
    const { data: renderJob } = await supabase
      .from("render_jobs")
      .select("voiceover_url, id")
      .eq("user_id", user.id)
      .or(shotPlanId ? `plan_id.eq.${shotPlanId}` : `plan_id.is.null`)
      .not("voiceover_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (renderJob?.voiceover_url) voiceoverUrl = renderJob.voiceover_url;
  }

  if (!voiceoverUrl) {
    console.warn("[compose-video] No voiceover found — audioAssetId will be 'silent' for all clips");
  }

  // ── BUILD RENDER CONTRACT — single frozen source of truth ────────────────
  // All pipeline stages (sort, frame math, URL reachability, validation) run
  // inside buildRenderContract. The returned contract is the only authority.
  // This route performs zero computation after this call.
  let contract: ValidRenderContract;
  try {
    const raw = await buildRenderContract(
      shots as unknown as ShotAssetInput[],
      voiceoverUrl,
      projectId,
    );
    assertContractRenderable(raw);
    contract = raw;
  } catch (err) {
    if (err instanceof RenderContractError) {
      console.error("[compose-video] Contract rejected:", err.violations);
      return NextResponse.json(
        { success: false, error: "Render contract failed", violations: err.violations },
        { status: 422 },
      );
    }
    throw err;
  }

  const hasVoiceover = contract.clips[0]?.audioAssetId !== "silent";
  console.log(
    `[compose-video] Contract built — ${contract.clips.length} clips, ` +
    `${contract.totalDurationFrames / contract.fps}s, ` +
    `audio=${hasVoiceover ? "voiceover" : "silent"}, compiledAt=${contract.compiledAt}`,
  );

  // ── Create/update render job row ─────────────────────────────────────────
  const { data: job, error: jobErr } = await supabase
    .from("render_jobs")
    .upsert(
      {
        user_id:         user.id,
        plan_id:         shotPlanId ?? null,
        status:          "assembling",
        total_shots:     contract.clips.length,
        completed_shots: contract.clips.length,
        voiceover_url:   voiceoverUrl ?? null,
        updated_at:      new Date().toISOString(),
      },
      { onConflict: shotPlanId ? "plan_id" : undefined },
    )
    .select("id")
    .single();

  const jobId: string | null = jobErr ? null : (job?.id ?? null);
  if (jobErr) console.warn("[compose-video] Could not create render_job row:", jobErr.message);

  // ── INCREMENTAL RENDER ENGINE ─────────────────────────────────────────────
  // Plans execution, batch-checks shard cache, splits into cached + pending.
  // Identical contracts → all shards hit cache → zero composer calls.
  const renderPlan = await rebuildRender(contract, projectId);
  const { plan, cachedShards, pendingShards } = renderPlan;

  console.log(
    `[compose-video] ExecutionPlan: ${plan.totalShards} shards — ` +
    `${pendingShards.length} pending, ${cachedShards.length} cached, job=${jobId ?? "untracked"}`,
  );

  // ── Execute pending shards in parallel ────────────────────────────────────
  // Inline execution on Fluid Compute (300 s budget). Each shard:
  //   downloads its clips → calls composer → uploads to storage → writes to cache.
  // Workers are stateless — they execute precompiled shard instructions only.
  if (pendingShards.length > 0) {
    const shardResults = await Promise.allSettled(
      pendingShards.map(shard =>
        processShardJob({ type: "render_shard", shard, projectId, userId: user.id, fps: contract.fps }),
      ),
    );

    const failures = shardResults
      .map((r, i) => ({ r, shard: pendingShards[i] }))
      .filter(({ r }) =>
        r.status === "rejected" ||
        (r.status === "fulfilled" && !(r.value as WorkerResult).success),
      );

    if (failures.length > 0) {
      const errors = failures.map(({ r, shard }) =>
        r.status === "rejected"
          ? `${shard.shardId}: ${(r as PromiseRejectedResult).reason}`
          : `${shard.shardId}: ${(r as PromiseFulfilledResult<WorkerResult>).value.error}`,
      );
      console.error("[compose-video] Shard failure(s):", errors);
      await markJobFailed(supabase, jobId, errors.join("; "));
      return NextResponse.json(
        { success: false, error: "One or more shards failed to render", errors },
        { status: 500 },
      );
    }
  }

  // ── Collect all shard outputs from cache ──────────────────────────────────
  // processShardJob writes every executed shard to the cache.
  // Cached shards were already in the cache before execution.
  // Both sets are retrieved here in one batch call.
  const allCacheHits = await getShardCache().getBatch(plan.shards.map(s => s.cacheKey));

  const shardsWithOutputs = plan.shards
    .map(shard => {
      const hit = allCacheHits.get(shard.cacheKey);
      return hit ? { ...shard, outputUrl: hit.outputUrl } : null;
    })
    .filter((s): s is RenderShard & { outputUrl: string } => s !== null);

  if (shardsWithOutputs.length !== plan.totalShards) {
    const missing = plan.shards.filter(s => !allCacheHits.has(s.cacheKey)).map(s => s.shardId);
    const msg = `Internal: shard outputs missing after execution — ${missing.join(", ")}`;
    console.error("[compose-video]", msg);
    await markJobFailed(supabase, jobId, msg);
    return NextResponse.json({ success: false, error: "Internal assembly error" }, { status: 500 });
  }

  // ── MERGE LAYER — deterministic final assembly ────────────────────────────
  // Stitches all shard outputs in index order, applies voiceover across full
  // timeline. Stateless and purely compositional — no per-clip logic.
  let mergeResult: MergeResult;
  try {
    mergeResult = await mergeShards(shardsWithOutputs, {
      composerUrl:  composerUrl!,
      composerKey:  composerKey ?? "",
      voiceoverUrl,
      fps:          contract.fps,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Merge failed";
    console.error("[compose-video] Merge error:", msg);
    await markJobFailed(supabase, jobId, msg);
    return NextResponse.json({ success: false, error: msg }, { status: 502 });
  }

  console.log(`[compose-video] Merge done — ${mergeResult.durationSeconds}s — downloading result`);

  // ── Download final video from composer ────────────────────────────────────
  const videoDownloadUrl = mergeResult.videoUrl.startsWith("http")
    ? mergeResult.videoUrl
    : `${composerUrl}${mergeResult.videoUrl}`;

  let videoBlob: Blob;
  try {
    videoBlob = await fetchBlob(videoDownloadUrl, "composed video");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to retrieve composed video from microservice";
    console.error("[compose-video] Video download error:", msg);
    await markJobFailed(supabase, jobId, msg);
    return NextResponse.json(
      { success: false, error: "Video assembled but could not be retrieved. Please contact support." },
      { status: 502 },
    );
  }

  // ── Upload to Supabase Storage ─────────────────────────────────────────────────
  const storagePath = jobId
    ? `renders/${jobId}/final.mp4`
    : `renders/${user.id}/${Date.now()}/final.mp4`;

  const videoBuffer = await videoBlob.arrayBuffer();

  const { error: uploadErr } = await supabase.storage
    .from("videos")
    .upload(storagePath, videoBuffer, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (uploadErr) {
    console.error("[compose-video] Storage upload failed:", uploadErr.message);
    await markJobFailed(supabase, jobId, `Storage upload failed: ${uploadErr.message}`);
    return NextResponse.json(
      {
        success: false,
        error: "Video assembled but failed to upload to storage. Please contact support.",
      },
      { status: 500 },
    );
  }

  const { data: { publicUrl } } = supabase.storage.from("videos").getPublicUrl(storagePath);

  // ── Persist final result to DB ─────────────────────────────────────────────────
  if (jobId) {
    const { error: updateErr } = await supabase
      .from("render_jobs")
      .update({
        status: "completed",
        video_url: publicUrl,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (updateErr) {
      // Non-fatal — video is uploaded, just log the tracking failure
      console.warn("[compose-video] Failed to update render_job:", updateErr.message);
    }
  }

  // Update project status so the dashboard can reflect completion
  await supabase
    .from("projects")
    .update({ status: "video_complete", video_url: publicUrl })
    .eq("id", projectId)
    .eq("user_id", user.id); // ownership guard

  console.log(`[compose-video] Complete — ${mergeResult.durationSeconds}s — ${plan.totalClips} clips → ${publicUrl}`);

  return NextResponse.json({
    success:          true,
    video_url:        publicUrl,
    duration_seconds: mergeResult.durationSeconds,
    shots_used:       plan.totalClips,
    total_shots:      plan.totalClips,
    has_audio:        hasVoiceover,
    job_id:           jobId,
    contract_compiled_at: contract.compiledAt,
    shards_total:     plan.totalShards,
    shards_cached:    cachedShards.length,
  });
}

// ── Utility ───────────────────────────────────────────────────────────────────

async function markJobFailed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  jobId: string | null,
  errorMessage: string,
): Promise<void> {
  if (!jobId) return;
  try {
    await supabase
      .from("render_jobs")
      .update({ status: "failed", error_message: errorMessage })
      .eq("id", jobId);
  } catch (err) {
    console.warn("[compose-video] Failed to mark job as failed:", err);
  }
}
