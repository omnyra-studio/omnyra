/**
 * Seedance 2.0 Fast via fal.ai — schema-aligned payload only.
 * ElevenLabs handles TTS voiceover separately.
 *
 * API schema: https://fal.ai/models/bytedance/seedance-2.0/fast/image-to-video/api
 * Valid input: prompt, image_url (i2v), resolution, duration, aspect_ratio,
 *               generate_audio, bitrate_mode, seed, end_user_id
 * NOT valid: negative_prompt, motion_strength (legacy fields — cause 422)
 */

import { fal } from "@fal-ai/client";
import { assertProviderModel, logFalRequest } from "./fal-guard";
import { formatFalError, logFalError, logFalPayload } from "./fal-errors";

const FAL_T2V_FAST = "bytedance/seedance-2.0/fast/text-to-video";
const FAL_I2V_FAST = "bytedance/seedance-2.0/fast/image-to-video";

const MAX_PROMPT_CHARS = 2000;
const POLL_INTERVAL_MS = 1500;
const SUBSCRIBE_TIMEOUT_MS = 180_000;
const COST_ESTIMATE_AUD = "0.15-0.30 AUD";

/** Seedance duration enum — API accepts 4–15 or "auto". */
const VALID_DURATIONS = new Set(["4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"]);

export const SEEDANCE_FAL_FAST_MODEL = "bytedance/seedance-2.0/fast";
export const SEEDANCE_T2V_MODEL = FAL_T2V_FAST;
export const SEEDANCE_I2V_MODEL = FAL_I2V_FAST;

export type SeedanceMotionStrength = "maximum" | "high" | "medium" | "low";

export interface FalSeedanceFastParams {
  prompt: string;
  imageUrl?: string | null;
  duration?: number;
  resolution?: "480p" | "720p";
  aspectRatio?: "9:16" | "16:9" | "1:1" | "auto" | "21:9" | "4:3" | "3:4";
  generateAudio?: boolean;
  /** Accepted for API compat — motion is conveyed via prompt, not sent to FAL. */
  motionStrength?: SeedanceMotionStrength;
  seed?: number;
  sceneNumber?: number;
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
  sceneNumber?: number;
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

/** Map requested seconds to Seedance duration enum (4–15). Default 6. */
function mapDuration(secs: number | undefined): { api: string; seconds: number } {
  const raw = secs && secs > 0 ? Math.round(secs) : 6;
  const clamped = Math.min(Math.max(raw, 4), 15);
  const api = String(clamped);
  if (!VALID_DURATIONS.has(api)) {
    return { api: "6", seconds: 6 };
  }
  return { api, seconds: clamped };
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

/** Re-upload hotlinked images to fal CDN when the host blocks FAL fetches. */
async function resolveSeedanceImageUrl(imageUrl: string): Promise<string | undefined> {
  const url = imageUrl.trim();
  if (!url.startsWith("https://")) return undefined;

  if (url.includes("fal.media") || url.includes("fal.run")) return url;

  try {
    const head = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (head.ok) return url;
  } catch { /* try upload */ }

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.warn(`[SEEDANCE_FAST] image fetch failed HTTP ${res.status} — falling back to T2V`);
      return undefined;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 500) return undefined;

    const ext = url.includes(".png") ? "png" : "jpg";
    const file = new File(
      [buf],
      `seedance-scene.${ext}`,
      { type: ext === "png" ? "image/png" : "image/jpeg" },
    );
    const uploaded = await fal.storage.upload(file);
    if (typeof uploaded === "string" && uploaded.startsWith("https://")) {
      console.log(`[SEEDANCE_FAST] image re-uploaded to fal storage`);
      return uploaded;
    }
  } catch (err) {
    console.warn(
      `[SEEDANCE_FAST] image resolve failed — falling back to T2V:`,
      err instanceof Error ? err.message : err,
    );
  }

  return undefined;
}

/** Build schema-valid Seedance input — no Luma/legacy fields. */
function buildSeedanceInput(params: {
  prompt: string;
  imageUrl?: string;
  durationApi: string;
  resolution: "480p" | "720p";
  aspectRatio: string;
  generateAudio: boolean;
  seed: number;
}): Record<string, unknown> {
  const input: Record<string, unknown> = {
    prompt:         trimPrompt(params.prompt),
    resolution:     params.resolution,
    duration:       params.durationApi,
    aspect_ratio:   params.aspectRatio,
    generate_audio: params.generateAudio,
    bitrate_mode:   "standard",
    seed:           params.seed,
  };

  if (params.imageUrl) {
    input.image_url = params.imageUrl;
  }

  return input;
}

/** Optimized Seedance Fast — i2v when image available, schema-aligned payload. */
export async function falSeedanceFastGenerate(
  params: FalSeedanceFastParams,
): Promise<FalSeedanceFastResult> {
  const startMs = Date.now();
  fal.config({ credentials: getFalKey() });

  const { api: durationApi, seconds: durationSecs } = mapDuration(params.duration);
  const seed = params.seed ?? Date.now() % 999_999_999;
  const resolution = params.resolution ?? "720p";
  const aspectRatio = params.aspectRatio ?? "9:16";
  const generateAudio = params.generateAudio ?? false;

  let resolvedImageUrl: string | undefined;
  if (typeof params.imageUrl === "string" && params.imageUrl.startsWith("https://")) {
    resolvedImageUrl = await resolveSeedanceImageUrl(params.imageUrl);
  }

  const useI2V = !!resolvedImageUrl;
  const model = useI2V ? FAL_I2V_FAST : FAL_T2V_FAST;

  assertProviderModel("seedance", model);
  logFalRequest({
    provider:    "seedance",
    model,
    endpoint:    model,
    sceneNumber: params.sceneNumber,
    duration:    durationApi,
  });

  const input = buildSeedanceInput({
    prompt:        params.prompt,
    imageUrl:      resolvedImageUrl,
    durationApi,
    resolution,
    aspectRatio,
    generateAudio,
    seed,
  });

  logFalPayload(`scene=${params.sceneNumber ?? "?"} i2v=${useI2V}`, model, input);
  console.log(`[SEEDANCE_FAST] Generating ${durationApi}s | i2v=${useI2V} | ${model}`);

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
      duration:     durationSecs,
      modelUsed:    model,
      generationMs: latencyMs,
      latencyMs,
      costEstimate: COST_ESTIMATE_AUD,
      seed:         (result?.data?.seed as number | undefined) ?? seed,
    };
  } catch (error) {
    const latencyMs = Date.now() - startMs;
    logFalError(`SEEDANCE_FAST scene=${params.sceneNumber ?? "?"}`, error, latencyMs);
    throw new Error(formatFalError(error));
  }
}

export async function callSeedance(input: SeedanceGenerateInput): Promise<SeedanceGenerateResult> {
  const result = await falSeedanceFastGenerate({
    prompt:         input.prompt,
    imageUrl:       input.imageUrl,
    duration:       input.duration,
    resolution:     (input.resolution === "480p" || input.resolution === "720p") ? input.resolution : "720p",
    aspectRatio:    input.aspectRatio,
    generateAudio:  input.generateAudio,
    motionStrength: input.motionStrength,
    sceneNumber:    input.sceneNumber,
  });
  return {
    url:           result.videoUrl,
    model_used:    result.modelUsed,
    generation_ms: result.generationMs,
    seed:          result.seed,
  };
}