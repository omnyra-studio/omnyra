/**
 * Shard render worker — composes one temporal shard of the timeline.
 *
 * Receives a precompiled RenderShard and executes its instructions:
 *   1. Idempotency check — cache hit means this shard was already composed
 *   2. Download clip blobs in parallel (all URLs pre-validated by contract)
 *   3. Call the composer microservice with the shard's clips (no voiceover here)
 *   4. Download the composed shard video from the composer
 *   5. Upload to Supabase Storage at shards/{userId}/{projectId}/{shardId}.mp4
 *   6. Write to shard cache (cacheKey → outputUrl)
 *   7. Emit SHARD_RENDER_COMPLETED
 *
 * Worker invariants (enforced by contract + planner — NOT re-checked here):
 *   - All clip URLs are reachable (contract Stage 5 head-checked them)
 *   - Frame math is precomputed on every RenderClip — never re-derived
 *   - Clips are in timeline order (planner sliced from contract.clips in order)
 *   - No DAG building, no validation, no normalization — pure execution only
 *
 * Voiceover is NOT applied here — it is applied once by the merge layer over
 * the complete assembled timeline, not per-shard.
 */

import { createClient } from "@supabase/supabase-js";
import type { RenderShardJob, WorkerResult } from "./types";
import { getShardCache } from "@/lib/render/shard-cache";
import { emitAndForget } from "@/lib/events/emitter";
import { cleanEnv } from "@/lib/supabase/admin";

function getServiceClient() {
  return createClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
}

async function fetchBlob(url: string, label: string): Promise<Blob> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${label} — ${url}`);
  return res.blob();
}

export async function processShardJob(job: RenderShardJob): Promise<WorkerResult> {
  const { shard, projectId, userId, fps } = job;

  const composerUrl = process.env.COMPOSER_SERVICE_URL;
  const composerKey = process.env.COMPOSER_API_KEY ?? "";

  if (!composerUrl) {
    return { success: false, error: "COMPOSER_SERVICE_URL not configured" };
  }

  // ── Idempotency — cache hit skips all work ──────────────────────────────────
  const cached = await getShardCache().get(shard.cacheKey);
  if (cached) {
    emitAndForget({
      type:          "SHARD_RENDER_COMPLETED",
      correlationId: projectId,
      payload:       { shardId: shard.shardId, outputUrl: cached.outputUrl, fromCache: true },
    });
    return { success: true };
  }

  emitAndForget({
    type:          "SHARD_RENDER_STARTED",
    correlationId: projectId,
    payload:       { shardId: shard.shardId, projectId, clipCount: shard.clipCount },
  });

  // ── Download clip blobs in parallel ─────────────────────────────────────────
  let clipBlobs: Blob[];
  try {
    clipBlobs = await Promise.all(
      shard.clips.map(c =>
        fetchBlob(c.videoAssetId, `clip[${c.index}] shot_${c.shotNumber}`),
      ),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Clip download failed";
    emitAndForget({
      type:          "SHARD_RENDER_FAILED",
      correlationId: projectId,
      payload:       { shardId: shard.shardId, error: msg },
    });
    return { success: false, error: msg };
  }

  // ── Build multipart form — pure execution of precompiled shard instructions ──
  // All values read from RenderClip fields — zero recomputation.
  // No voiceover at this stage — applied by the merge layer across the full timeline.
  const form = new FormData();

  for (let i = 0; i < shard.clips.length; i++) {
    form.append("clips", clipBlobs[i], `clip_${shard.clips[i].index}.mp4`);
  }

  form.append("shot_plan", JSON.stringify({
    shots: shard.clips.map(clip => ({
      duration:            clip.renderFrames / fps,
      energy_curve:        clip.meta.energyCurve,
      transition_in:       clip.meta.transitionIn,
      transition_after:    clip.meta.transitionAfter,
      transition_duration: clip.meta.transitionDuration,
      zoom_effect:         clip.meta.zoomEffect,
      start_frame:         clip.startFrame,
      end_frame:           clip.endFrame,
      frame_norm: {
        render_frames:  clip.renderFrames,
        target_frames:  clip.targetFrames,
        padding_frames: clip.paddingFrames,
        aligned:        clip.renderFrames <= clip.targetFrames,
      },
    })),
  }));

  // ── Call the composer microservice ───────────────────────────────────────────
  const controller = new AbortController();
  const id         = setTimeout(() => controller.abort(), 120_000);

  let composeRes: Response;
  try {
    composeRes = await fetch(`${composerUrl}/compose`, {
      method:  "POST",
      headers: { "x-api-key": composerKey },
      body:    form,
      signal:  controller.signal,
    });
  } catch (err) {
    const msg = err instanceof Error && err.name === "AbortError"
      ? "Composer timed out"
      : "Composer unavailable";
    emitAndForget({
      type:          "SHARD_RENDER_FAILED",
      correlationId: projectId,
      payload:       { shardId: shard.shardId, error: msg },
    });
    return { success: false, error: msg };
  } finally {
    clearTimeout(id);
  }

  if (!composeRes.ok) {
    let msg = `Composer HTTP ${composeRes.status}`;
    try {
      const b = await composeRes.json() as { error?: string };
      if (b.error) msg = b.error;
    } catch { /* ignore */ }
    emitAndForget({
      type:          "SHARD_RENDER_FAILED",
      correlationId: projectId,
      payload:       { shardId: shard.shardId, error: msg },
    });
    return { success: false, error: msg };
  }

  const composeResult = await composeRes.json() as {
    success: boolean;
    video_url: string;
    duration_seconds: number | null;
    error?: string;
  };

  if (!composeResult.success || !composeResult.video_url) {
    const msg = composeResult.error ?? "Composer reported failure";
    emitAndForget({
      type:          "SHARD_RENDER_FAILED",
      correlationId: projectId,
      payload:       { shardId: shard.shardId, error: msg },
    });
    return { success: false, error: msg };
  }

  // ── Download composed shard from composer ────────────────────────────────────
  const videoDownloadUrl = composeResult.video_url.startsWith("http")
    ? composeResult.video_url
    : `${composerUrl}${composeResult.video_url}`;

  let videoBlob: Blob;
  try {
    videoBlob = await fetchBlob(videoDownloadUrl, `shard ${shard.shardId} output`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Shard video download failed";
    emitAndForget({
      type:          "SHARD_RENDER_FAILED",
      correlationId: projectId,
      payload:       { shardId: shard.shardId, error: msg },
    });
    return { success: false, error: msg };
  }

  // ── Upload shard video to Supabase Storage ───────────────────────────────────
  const storagePath = `shards/${userId}/${projectId}/${shard.shardId}.mp4`;
  const supabase    = getServiceClient();

  const { error: uploadErr } = await supabase.storage
    .from("videos")
    .upload(storagePath, await videoBlob.arrayBuffer(), {
      contentType: "video/mp4",
      upsert:      true,
    });

  if (uploadErr) {
    const msg = `Shard storage upload failed: ${uploadErr.message}`;
    emitAndForget({
      type:          "SHARD_RENDER_FAILED",
      correlationId: projectId,
      payload:       { shardId: shard.shardId, error: msg },
    });
    return { success: false, error: msg };
  }

  const { data: { publicUrl } } = supabase.storage.from("videos").getPublicUrl(storagePath);
  const durationSeconds         = composeResult.duration_seconds ?? shard.durationSeconds;

  // ── Write to shard cache ─────────────────────────────────────────────────────
  await getShardCache().set({
    cacheKey:        shard.cacheKey,
    shardId:         shard.shardId,
    outputUrl:       publicUrl,
    durationSeconds,
    cachedAt:        new Date().toISOString(),
  });

  emitAndForget({
    type:          "SHARD_RENDER_COMPLETED",
    correlationId: projectId,
    payload:       { shardId: shard.shardId, outputUrl: publicUrl, fromCache: false },
  });

  console.log(`[shard-worker] ${shard.shardId} → ${durationSeconds}s → ${publicUrl}`);
  return { success: true };
}
