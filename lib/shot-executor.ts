/**
 * Shot Executor — dispatches a single ShotPacket to the correct render API.
 *
 * Video shots: direct Kling API (bypasses fal.ai markup); fal.ai used as fallback.
 * text_overlay: fal.ai Flux still-image card held for duration.
 *
 * All paths retry once on failure before returning null.
 */

import { fal } from "@fal-ai/client";
import type { ShotPacket } from "./types/shot";
import { extractVideoUrl } from "./video-models";
import { compileKlingPrompt } from "./video-quality";
import { generateKlingDirect, isDirectKlingAvailable } from "@/lib/providers/kling-direct";

// ── fal.ai config (fallback only) ─────────────────────────────────────────────

fal.config({ credentials: process.env.FAL_API_KEY });

// ── Public types ──────────────────────────────────────────────────────────────

export interface ShotAssets {
  voiceId?: string;
  voiceText?: string;
}

export interface ShotExecutionResult {
  videoUrl: string;
  duration: number;
}

// Kling v3 standard model IDs — used for FAL_TO_DIRECT mapping fallback
export const SEEDANCE_T2V_MODEL = "fal-ai/kling-video/v3/standard/text-to-video";
export const SEEDANCE_I2V_MODEL = "fal-ai/kling-video/v3/standard/image-to-video";
export const KLING_I2V_MODEL    = "fal-ai/kling-video/v3/standard/image-to-video";

/**
 * Builds a structured Kling prompt — camera direction first, motion verbs injected.
 */
export function augmentPrompt(shot: ShotPacket): string {
  return compileKlingPrompt(shot, null);
}

// Kling accepts integers 5–10 only.
export function seedanceDuration(seconds: number): "5" | "10" {
  return Math.max(5, Math.min(10, Math.round(seconds || 5))) <= 7 ? "5" : "10";
}

// Re-exported for callers that imported extractVideoUrl from this module.
export { extractVideoUrl };

const SHOT_TIMEOUT_MS = 180_000; // 3 min — within Vercel 300s function limit

async function executeFalShot(shot: ShotPacket): Promise<ShotExecutionResult> {
  const prompt   = augmentPrompt(shot);
  const duration = seedanceDuration(shot.duration_seconds);
  const isI2V    = !!shot.scene_image_url;
  const falModel = isI2V ? SEEDANCE_I2V_MODEL : SEEDANCE_T2V_MODEL;

  // ── Direct Kling (preferred) ──────────────────────────────────────────────
  if (isDirectKlingAvailable()) {
    try {
      const direct = await generateKlingDirect(
        {
          falModelId:      falModel,
          prompt,
          negative_prompt: "blurry, low quality, distorted, watermark",
          duration,
          aspect_ratio:    "9:16",
          cfg_scale:       0.5,
          image_url:       shot.scene_image_url ?? undefined,
        },
        SHOT_TIMEOUT_MS,
        `shot=${shot.shot_id}`,
      );
      return { videoUrl: direct.video_url, duration: shot.duration_seconds };
    } catch (directErr) {
      console.warn(`[shot-executor] direct Kling failed for shot ${shot.shot_id}: ${(directErr as Error).message} — falling back to fal.ai`);
    }
  }

  // ── fal.ai fallback ───────────────────────────────────────────────────────
  if (!isI2V) {
    const input = { prompt, duration, aspect_ratio: "9:16", generate_audio: false };
    console.log(`[Shot ${shot.shot_number}] fal.ai fallback model=${SEEDANCE_T2V_MODEL}`);
    const result = await (fal as any).subscribe(SEEDANCE_T2V_MODEL, { input, logs: false, pollInterval: 5000 });
    const videoUrl = extractVideoUrl(result);
    if (!videoUrl) throw new Error(`${SEEDANCE_T2V_MODEL} returned no video URL`);
    return { videoUrl, duration: shot.duration_seconds };
  }

  const i2vInput = { prompt, image_url: shot.scene_image_url, duration, aspect_ratio: "9:16", generate_audio: false };
  console.log(`[Shot ${shot.shot_number}] fal.ai fallback model=${SEEDANCE_I2V_MODEL}`);
  let result: unknown;
  try {
    result = await (fal as any).subscribe(SEEDANCE_I2V_MODEL, { input: i2vInput, logs: false, pollInterval: 5000 });
  } catch (seedanceErr) {
    console.warn(`[Shot ${shot.shot_number}] Seedance i2v failed, falling back to Kling:`, seedanceErr);
    const klingInput = { prompt, image_url: shot.scene_image_url, duration: Number(duration), aspect_ratio: "9:16" };
    result = await (fal as any).subscribe(KLING_I2V_MODEL, { input: klingInput, logs: false, pollInterval: 5000 });
  }
  const videoUrl = extractVideoUrl(result);
  if (!videoUrl) throw new Error(`image-to-video returned no video URL for shot ${shot.shot_number}`);
  return { videoUrl, duration: shot.duration_seconds };
}

// ── Text overlay ──────────────────────────────────────────────────────────────

async function executeTextOverlay(shot: ShotPacket): Promise<ShotExecutionResult> {
  const prompt = [
    `Bold text overlay card: "${shot.visual_prompt}"`,
    "Dark cinematic background, white bold typography, luxury brand aesthetic,",
    "9:16 portrait format, high contrast, clean minimalist design",
  ].join(" ");

  const result = await (fal as any).subscribe("fal-ai/flux/dev", {
    input: { prompt, image_size: "portrait_16_9", num_inference_steps: 28, num_images: 1 },
    logs: false,
  });

  const imageUrl: string =
    result?.images?.[0]?.url ??
    result?.data?.images?.[0]?.url;

  if (!imageUrl) throw new Error("fal.ai text overlay returned no image URL");
  return { videoUrl: imageUrl, duration: shot.duration_seconds };
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

/**
 * Executes a single shot packet by routing to the correct render API.
 * Retries once on failure (after 5 seconds).
 * Returns null if both attempts fail.
 */
export async function executeShot(
  shot: ShotPacket,
  assets: ShotAssets = {},
): Promise<ShotExecutionResult | null> {
  const attempt = async (): Promise<ShotExecutionResult> => {
    if (shot.content_type === "text_overlay") {
      return executeTextOverlay(shot);
    }
    return executeFalShot(shot);
  };

  try {
    return await attempt();
  } catch (err) {
    console.error(
      `[shot-executor] shot ${shot.shot_id} (${shot.render_assignment}) failed:`,
      err instanceof Error ? err.message : err,
      "— retrying in 5s",
    );
    await sleep(5000);
    try {
      return await attempt();
    } catch (retryErr) {
      console.error(
        `[shot-executor] shot ${shot.shot_id} retry failed:`,
        retryErr instanceof Error ? retryErr.message : retryErr,
      );
      throw retryErr;
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
