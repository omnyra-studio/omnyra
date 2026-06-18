/**
 * Shot Executor — dispatches a single ShotPacket to the correct render API.
 *
 * Video shots: **Seedance via ElevenLabs only** (Kling + fal.ai disabled).
 * text_overlay: fal.ai Flux still-image card (unchanged).
 */

import type { ShotPacket } from "./types/shot";
import { compileKlingPrompt } from "./video-quality";
import { fal } from "@fal-ai/client";
import { extractVideoUrl } from "./video-models";
import { elevenLabsSeedanceGenerate, SEEDANCE_ELEVENLABS_MODEL } from "@/lib/services/elevenlabs";

fal.config({ credentials: process.env.FAL_API_KEY });

export interface ShotAssets {
  voiceId?: string;
  voiceText?: string;
}

export interface ShotExecutionResult {
  videoUrl: string;
  duration: number;
}

export const SEEDANCE_T2V_MODEL = SEEDANCE_ELEVENLABS_MODEL;
export const SEEDANCE_I2V_MODEL = SEEDANCE_ELEVENLABS_MODEL;
export const KLING_I2V_MODEL = SEEDANCE_ELEVENLABS_MODEL;

export function augmentPrompt(shot: ShotPacket, isCinematicAd: boolean = false): string {
  return compileKlingPrompt(shot, null, isCinematicAd);
}

export function seedanceDuration(seconds: number): number {
  return Math.max(4, Math.min(15, Math.round(seconds || 5)));
}

export { extractVideoUrl };

const SHOT_TIMEOUT_MS = 180_000;

export async function executeDirectKlingShot(shot: ShotPacket): Promise<ShotExecutionResult> {
  const prompt   = augmentPrompt(shot);
  const duration = seedanceDuration(shot.duration_seconds);
  const isI2V    = !!shot.scene_image_url;

  console.info(`[shot-executor] Seedance via ElevenLabs (Kling disabled) for shot ${shot.shot_number}`);

  console.log("✅ FORCING SEEDANCE VIA ELEVENLABS ONLY");
  const result = await elevenLabsSeedanceGenerate({
    prompt,
    duration:        6,
    resolution:      "720p",
    motionIntensity: "high",
    rawPrompt:       true,
    generateAudio:   false,
  });

  return { videoUrl: result.videoUrl, duration: shot.duration_seconds };
}

async function executeTextOverlay(shot: ShotPacket): Promise<ShotExecutionResult> {
  const prompt = [
    `Bold text overlay card: "${shot.visual_prompt}"`,
    "Dark cinematic background, white bold typography, luxury brand aesthetic,",
    "9:16 portrait format, high contrast, clean minimalist design",
  ].join(" ");

  const result = await (fal as { subscribe: (id: string, opts: Record<string, unknown>) => Promise<unknown> }).subscribe(
    "fal-ai/flux/dev",
    { input: { prompt, image_size: "portrait_16_9", num_inference_steps: 28, num_images: 1 }, logs: false },
  );

  const r = result as Record<string, unknown>;
  const imageUrl: string =
    (r?.images as Array<{ url: string }> | undefined)?.[0]?.url ??
    ((r?.data as { images?: Array<{ url: string }> })?.images)?.[0]?.url ?? "";

  if (!imageUrl) throw new Error("fal.ai text overlay returned no image URL");
  return { videoUrl: imageUrl, duration: shot.duration_seconds };
}

export async function executeShot(
  shot: ShotPacket,
  assets: ShotAssets = {},
): Promise<ShotExecutionResult | null> {
  const attempt = async (): Promise<ShotExecutionResult> => {
    if (shot.content_type === "text_overlay") {
      return executeTextOverlay(shot);
    }
    return executeDirectKlingShot(shot);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}