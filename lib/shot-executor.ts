/**
 * Shot Executor — dispatches a single ShotPacket to the correct render API.
 *
 * avatar shots:   fal.ai Kling image-to-video; scene_image_url is the entire frame
 * text_overlay:   fal.ai Flux still-image card held for duration
 *
 * All paths retry once on failure before returning null.
 */

import { fal } from "@fal-ai/client";
import type { ShotPacket } from "./types/shot";
import { extractVideoUrl } from "./video-models";
import { compileKlingPrompt } from "./video-quality";

// ── fal.ai config ─────────────────────────────────────────────────────────────

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


// Kling v3 standard — used by shot-executor (direct fal calls outside parallel engine)
export const SEEDANCE_T2V_MODEL = "fal-ai/kling-video/v3/standard/text-to-video";
export const SEEDANCE_I2V_MODEL = "fal-ai/kling-video/v3/standard/image-to-video";
export const KLING_I2V_MODEL    = "fal-ai/kling-video/v3/standard/image-to-video";

/**
 * Builds a structured Kling prompt — camera direction first, motion verbs injected.
 * Delegates to compileKlingPrompt from video-quality for full logic.
 */
export function augmentPrompt(shot: ShotPacket): string {
  return compileKlingPrompt(shot, null);
}

// Seedance 2 accepts integers 5–10 only. Clamp hard — passing 4 or 11+ causes API errors.
export function seedanceDuration(seconds: number): string {
  return String(Math.max(5, Math.min(10, Math.round(seconds || 5))));
}

// Re-exported for callers that imported extractVideoUrl from this module.
export { extractVideoUrl };

async function executeFalShot(shot: ShotPacket): Promise<ShotExecutionResult> {
  const prompt = augmentPrompt(shot);
  const duration = seedanceDuration(shot.duration_seconds);

  if (!shot.scene_image_url) {
    // PATH: text-to-video — no scene image, use Seedance 2
    const input = { prompt, duration, aspect_ratio: "9:16", generate_audio: false };
    console.log(`[Shot ${shot.shot_number}] model=${SEEDANCE_T2V_MODEL}`, JSON.stringify(input));

     
    const result = await (fal as any).subscribe(SEEDANCE_T2V_MODEL, {
      input,
      logs: false,
      pollInterval: 5000,
    });

    const videoUrl = extractVideoUrl(result);
    if (!videoUrl) throw new Error(`${SEEDANCE_T2V_MODEL} returned no video URL`);
    return { videoUrl, duration: shot.duration_seconds };
  }

  // PATH: image-to-video — try Seedance 2 first, fall back to Kling v3
  const i2vInput = {
    prompt,
    image_url: shot.scene_image_url,
    duration,
    aspect_ratio: "9:16",
    generate_audio: false,
  };
  console.log(
    `[Shot ${shot.shot_number}] model=${SEEDANCE_I2V_MODEL}`,
    JSON.stringify({ ...i2vInput, image_url: i2vInput.image_url.substring(0, 80) }),
  );

  let result: unknown;
  try {
     
    result = await (fal as any).subscribe(SEEDANCE_I2V_MODEL, {
      input: i2vInput,
      logs: false,
      pollInterval: 5000,
    });
  } catch (seedanceErr) {
    console.warn(`[Shot ${shot.shot_number}] Seedance i2v failed, falling back to Kling:`, seedanceErr);
    // Kling v3 accepts numeric duration
    const klingInput = { prompt, image_url: shot.scene_image_url, duration: Number(duration), aspect_ratio: "9:16" };
    console.log(`[Shot ${shot.shot_number}] model=${KLING_I2V_MODEL} (fallback)`, JSON.stringify({ ...klingInput, image_url: klingInput.image_url.substring(0, 80) }));
     
    result = await (fal as any).subscribe(KLING_I2V_MODEL, {
      input: klingInput,
      logs: false,
      pollInterval: 5000,
    });
  }

  const videoUrl = extractVideoUrl(result);
  if (!videoUrl) throw new Error(`image-to-video returned no video URL for shot ${shot.shot_number}`);
  return { videoUrl, duration: shot.duration_seconds };
}

// ── Text overlay ──────────────────────────────────────────────────────────────

async function executeTextOverlay(shot: ShotPacket): Promise<ShotExecutionResult> {
  // Generate a stylised text card via fal.ai image generation
  const prompt = [
    `Bold text overlay card: "${shot.visual_prompt}"`,
    "Dark cinematic background, white bold typography, luxury brand aesthetic,",
    "9:16 portrait format, high contrast, clean minimalist design",
  ].join(" ");

   
  const result = await (fal as any).subscribe("fal-ai/flux/dev", {
    input: {
      prompt,
      image_size: "portrait_16_9",
      num_inference_steps: 28,
      num_images: 1,
    },
    logs: false,
  });

  const imageUrl: string =
    result?.images?.[0]?.url ??
    result?.data?.images?.[0]?.url;

  if (!imageUrl) throw new Error("fal.ai text overlay returned no image URL");

  // Return image URL — composer treats it as a static frame held for duration
  return { videoUrl: imageUrl, duration: shot.duration_seconds };
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

/**
 * Executes a single shot packet by routing to the correct render API.
 *
 * Retries once on failure (after 5 seconds).
 * Returns null if both attempts fail — the composition engine extends adjacent shots.
 */
export async function executeShot(
  shot: ShotPacket,
  assets: ShotAssets = {},
): Promise<ShotExecutionResult | null> {
  const attempt = async (): Promise<ShotExecutionResult> => {
    if (shot.content_type === "text_overlay") {
      return executeTextOverlay(shot);
    }

    // avatar, broll, transition — all animate via fal.ai
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
      // Re-throw so callers (generate-cinematic, generate-shot) surface the real error
      throw retryErr;
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
