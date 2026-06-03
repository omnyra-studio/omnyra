/**
 * Shot render worker — processes one shot per job invocation.
 *
 * Routing logic mirrors /api/generate-shot:
 *   text_overlay                → fal Flux via executeShot() (sync, fast)
 *   everything else             → fal.queue.submit() with Seedance — async, returns immediately
 *
 * For async fal shots the worker exits after submitting. Completion is
 * detected via the existing /api/generate-shot/status-batch polling endpoint
 * (driven by the director page). When the last shot completes, the
 * coordinator is triggered.
 */

import { createClient }     from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fal }               from "@fal-ai/client";
import {
  executeShot,
  augmentPrompt,
  seedanceDuration,
  SEEDANCE_I2V_MODEL,
  SEEDANCE_T2V_MODEL,
} from "@/lib/shot-executor";
import type { ShotPacket }     from "@/lib/types/shot";
import type { ShotAssets }     from "@/lib/shot-executor";
import type { RenderShotJob, WorkerResult } from "./types";
import { emitAndForget } from "@/lib/events/emitter";

fal.config({ credentials: process.env.FAL_API_KEY });

export async function processShotJob(job: RenderShotJob): Promise<WorkerResult> {
  const { planId, shotDbId, shotId, userId } = job;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // ── Load shot ─────────────────────────────────────────────────────────────────
  const { data: shot, error: shotErr } = await supabase
    .from("shots")
    .select("*")
    .eq("id", shotDbId)
    .single();

  if (shotErr || !shot) {
    return { success: false, error: `Shot ${shotDbId} not found` };
  }

  // Skip already-rendered shots (idempotency — queue may redeliver)
  if (shot.render_status === "completed" || shot.clip_url) {
    return { success: true };
  }

  // ── Load voice assets ─────────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("voice_id")
    .eq("id", userId)
    .single();

  const assets: ShotAssets = {
    voiceId:   profile?.voice_id               ?? undefined,
    voiceText: (shot.narration_text as string) ?? "",
  };

  // ── Guard: scene image required for non-text_overlay shots ───────────────────
  if (shot.content_type !== "text_overlay" && !shot.scene_image_url) {
    await markFailed(supabase, shotId, "No scene image — generate scene images first", planId, shot.shot_number as number);
    return { success: false, error: "No scene image" };
  }

  await supabase
    .from("shots")
    .update({ render_status: "rendering", render_error: null })
    .eq("shot_id", shotId);

  emitAndForget({
    type:          "SHOT_RENDER_STARTED",
    correlationId: planId,
    payload: {
      planId,
      shotId,
      shotNumber: shot.shot_number as number,
      renderer:   shot.content_type === "text_overlay" ? "flux" : "fal",
    },
  });

  const isAsyncFal = shot.content_type !== "text_overlay";

  // ── Async fal path ────────────────────────────────────────────────────────────
  if (isAsyncFal) {
    const model  = shot.scene_image_url ? SEEDANCE_I2V_MODEL : SEEDANCE_T2V_MODEL;
    const prompt = augmentPrompt(shot as ShotPacket);
    const dur    = seedanceDuration(shot.duration_seconds as number);
    const input  = shot.scene_image_url
      ? { prompt, image_url: shot.scene_image_url, duration: dur, aspect_ratio: "9:16", generate_audio: false }
      : { prompt, duration: dur, aspect_ratio: "9:16", generate_audio: false };

    try {
       
      const submitted = await (fal as any).queue.submit(model, { input }) as { request_id: string };
      await supabase
        .from("shots")
        .update({ fal_request_id: submitted.request_id, fal_model: model })
        .eq("shot_id", shotId);

      console.log(`[shot-worker] shot ${shot.shot_number} queued → fal ${submitted.request_id}`);
      return { success: true };  // async — actual completion tracked via status-batch
    } catch (err) {
      const msg = err instanceof Error ? err.message : "fal submit failed";
      await markFailed(supabase, shotId, msg, planId, shot.shot_number as number);
      return { success: false, error: msg };
    }
  }

  // ── Sync path (text_overlay only) ────────────────────────────────────────────
  try {
    const result = await executeShot(shot as ShotPacket, assets);
    if (!result) throw new Error("Shot execution returned null after retries");

    await supabase
      .from("shots")
      .update({
        render_status: "completed",
        clip_url:      result.videoUrl,
        render_error:  null,
      })
      .eq("shot_id", shotId);

    console.log(`[shot-worker] shot ${shot.shot_number} done → ${result.videoUrl}`);

    emitAndForget({
      type:          "SHOT_RENDER_COMPLETED",
      correlationId: planId,
      payload: {
        planId,
        shotId,
        shotNumber: shot.shot_number as number,
        clipUrl:    result.videoUrl,
      },
    });

    // ── After sync shot completes: check if full plan is ready to compose ────────
    await maybeEnqueueComposition(supabase, planId, userId);

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Shot execution failed";
    await markFailed(supabase, shotId, msg, planId, shot.shot_number as number);
    return { success: false, error: msg };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function markFailed(
  supabase:   SupabaseClient,
  shotId:     string,
  error:      string,
  planId?:    string,
  shotNumber?: number,
): Promise<void> {
  await supabase
    .from("shots")
    .update({ render_status: "failed", render_error: error })
    .eq("shot_id", shotId);

  if (planId) {
    emitAndForget({
      type:          "SHOT_RENDER_FAILED",
      correlationId: planId,
      payload:       { planId, shotId, shotNumber: shotNumber ?? 0, error },
    });
  }
}

/**
 * After a sync shot completes, check whether all shots are done AND
 * the voiceover is ready. If both conditions are met, enqueue composition.
 */
async function maybeEnqueueComposition(
  supabase: SupabaseClient,
  planId:   string,
  userId:   string,
): Promise<void> {
  try {
    const { checkAndEnqueueComposition } = await import("./coordinator");
    await checkAndEnqueueComposition(supabase, planId, userId);
  } catch (err) {
    // Non-fatal — composition can be triggered manually from director page
    console.warn("[shot-worker] coordinator check failed:", err);
  }
}
