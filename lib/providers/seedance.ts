/**
 * Seedance Fast via fal.ai — latency + cost optimized.
 * ElevenLabs handles TTS voiceover separately.
 */

import { fal } from "@fal-ai/client";

const FAL_T2V_FAST = "bytedance/seedance-2.0/fast/text-to-video";
const FAL_I2V_FAST = "bytedance/seedance-2.0/fast/image-to-video";

const MAX_PROMPT_CHARS = 400;
const POLL_INTERVAL_MS = 1000;
const SUBSCRIBE_TIMEOUT_MS = 120_000;
const COST_ESTIMATE_AUD = "0.15-0.30 AUD";

export const SEEDANCE_FAL_FAST_MODEL = "bytedance/seedance-2.0/fast";
export const SEEDANCE_T2V_MODEL = FAL_T2V_FAST;
export const SEEDANCE_I2V_MODEL = FAL_I2V_FAST;

export type SeedanceMotionStrength = "maximum" | "high" | "medium" | "low";

export interface FalSeedanceFastParams {
  prompt: string;
  imageUrl?: string | null;
  duration?: number;
  resolution?: "480p" | "720p";
  aspectRatio?: "9:16" | "16:9" | "1:1" | "auto";
  generateAudio?: boolean;
  motionStrength?: SeedanceMotionStrength;
  seed?: number;
}

export interface FalSeedanceFastResult {
  videoUrl: string;
  duration: number;
  modelUsed: string;
  generationMs: number;
  latencyMs: number;
  costEstimate: string;
  seed?: number;
}

export interface SeedanceGenerateInput {
  prompt: string;
  duration?: number;
  motionStrength?: SeedanceMotionStrength;
  aspectRatio?: "9:16" | "16:9" | "1:1" | "auto";
  imageUrl?: string;
  generateAudio?: boolean;
  resolution?: "480p" | "720p" | "1080p";
  pollInterval?: number;
}

export interface SeedanceGenerateResult {
  url: string;
  model_used: string;
  generation_ms: number;
  seed?: number;
}

function getFalKey(): string {
  const key = process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY ?? "";
  if (!key) throw new Error("FAL_API_KEY not configured — required for Seedance Fast video generation");
  return key;
}

/** Max 6s for speed & cost; default 6. */
function clampDuration(secs: number | undefined): number {
  const raw = secs && secs > 0 ? Math.round(secs) : 6;
  return Math.min(raw, 6);
}

function trimPrompt(prompt: string): string {
  return prompt.trim().slice(0, MAX_PROMPT_CHARS);
}

function extractFalVideoUrl(data: Record<string, unknown> | undefined): string | undefined {
  if (!data) return undefined;
  const video = data.video;
  if (typeof video === "string" && video.startsWith("http")) return video;
  if (video && typeof video === "object" && !Array.isArray(video)) {
    const url = (video as { url?: string }).url;
    if (url?.startsWith("http")) return url;
  }
  if (typeof data.video_url === "string" && data.video_url.startsWith("http")) return data.video_url;
  return undefined;
}

/** Optimized Seedance Fast — i2v when image available, concise prompt, 6s max. */
export async function falSeedanceFastGenerate(
  params: FalSeedanceFastParams,
): Promise<FalSeedanceFastResult> {
  const startMs = Date.now();
  fal.config({ credentials: getFalKey() });

  const duration = clampDuration(params.duration);
  const hasImage = typeof params.imageUrl === "string" && params.imageUrl.startsWith("https://");
  const model = hasImage ? FAL_I2V_FAST : FAL_T2V_FAST;
  const seed = params.seed ?? Date.now() % 999_999_999;
  const motionStrength = params.motionStrength ?? "medium";

  console.log(`[SEEDANCE_FAST] Generating ${duration}s clip | Image input: ${hasImage}`);

  const input: Record<string, unknown> = {
    prompt:           trimPrompt(params.prompt),
    negative_prompt:  "extra limbs, extra hands, extra fingers, duplicate objects, two phones, multiple phones, deformed hands, mutated, disfigured, watermark, text",
    duration:         String(duration),
    resolution:       params.resolution ?? "720p",
    aspect_ratio:     params.aspectRatio ?? "9:16",
    generate_audio:   params.generateAudio ?? false,
    motion_strength:  motionStrength,
    seed,
  };
  if (hasImage) input.image_url = params.imageUrl;

  try {
    const result = await fal.subscribe(model, {
      input,
      pollInterval: POLL_INTERVAL_MS,
      timeout:      SUBSCRIBE_TIMEOUT_MS,
      logs:         false,
    }) as { data?: Record<string, unknown> };

    const videoUrl = extractFalVideoUrl(result?.data);
    const latencyMs = Date.now() - startMs;

    if (!videoUrl) {
      throw new Error(`fal.ai Seedance Fast returned no video URL — ${JSON.stringify(result?.data ?? {}).substring(0, 200)}`);
    }

    console.log(`[SEEDANCE_FAST] ✅ Done in ${latencyMs}ms`);

    return {
      videoUrl,
      duration,
      modelUsed:    model,
      generationMs: latencyMs,
      latencyMs,
      costEstimate: COST_ESTIMATE_AUD,
      seed:         (result?.data?.seed as number | undefined) ?? seed,
    };
  } catch (error) {
    const latencyMs = Date.now() - startMs;
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[SEEDANCE_FAST] Failed after ${latencyMs}ms:`, msg);
    throw error;
  }
}

/** Legacy alias — routes to optimized Seedance Fast. */
export async function callSeedance(input: SeedanceGenerateInput): Promise<SeedanceGenerateResult> {
  const result = await falSeedanceFastGenerate({
    prompt:         input.prompt,
    imageUrl:       input.imageUrl,
    duration:       input.duration,
    resolution:     (input.resolution === "480p" || input.resolution === "720p") ? input.resolution : "720p",
    aspectRatio:    input.aspectRatio,
    generateAudio:  input.generateAudio,
    motionStrength: input.motionStrength ?? "medium",
  });
  return {
    url:           result.videoUrl,
    model_used:    result.modelUsed,
    generation_ms: result.generationMs,
    seed:          result.seed,
  };
}