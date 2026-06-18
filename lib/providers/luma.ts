/**
 * Luma Dream Machine (Ray 2) cinematic video via fal.ai — sole video provider.
 * Endpoints: fal-ai/luma-dream-machine/ray-2 (+ image-to-video)
 * Auth: FAL_API_KEY (Luma is proxied through fal.ai, not LUMA_API_KEY directly)
 */

import { fal } from "@fal-ai/client";

/** Luma Dream Machine Ray 2 — text-to-video */
export const LUMA_DREAM_MACHINE_T2V = "fal-ai/luma-dream-machine/ray-2";
/** Luma Dream Machine Ray 2 — image-to-video */
export const LUMA_DREAM_MACHINE_I2V = "fal-ai/luma-dream-machine/ray-2/image-to-video";

export const LUMA_DREAM_MACHINE_MODEL = LUMA_DREAM_MACHINE_T2V;

/** @deprecated Use LUMA_DREAM_MACHINE_* */
export const LUMA_RAY2_MODEL = LUMA_DREAM_MACHINE_T2V;
export const LUMA_RAY2_T2V = LUMA_DREAM_MACHINE_T2V;
export const LUMA_RAY2_I2V = LUMA_DREAM_MACHINE_I2V;

const MAX_PROMPT_CHARS = 2000;
const POLL_INTERVAL_MS = 2000;
const SUBSCRIBE_TIMEOUT_MS = 300_000;

export type LumaDuration = "5s" | "9s";
export type LumaResolution = "540p" | "720p" | "1080p";
export type LumaAspectRatio = "9:16" | "16:9" | "4:3" | "3:4" | "21:9" | "9:21";

export interface FalLumaParams {
  prompt: string;
  imageUrl?: string | null;
  duration?: number;
  resolution?: LumaResolution | "480p";
  aspectRatio?: LumaAspectRatio | "1:1" | "auto";
  loop?: boolean;
  seed?: number;
}

export interface FalLumaResult {
  videoUrl: string;
  duration: number;
  modelUsed: string;
  generationMs: number;
  latencyMs: number;
  seed?: number;
}

/** Legacy compat — same shape as former Seedance params. */
export interface FalSeedanceFastParams extends FalLumaParams {
  generateAudio?: boolean;
  motionStrength?: string;
}

export interface FalSeedanceFastResult extends FalLumaResult {
  costEstimate?: string;
}

export interface SeedanceGenerateInput extends FalLumaParams {
  motionStrength?: string;
  generateAudio?: boolean;
  pollInterval?: number;
}

export interface SeedanceGenerateResult {
  url: string;
  model_used: string;
  generation_ms: number;
  seed?: number;
}

export const SEEDANCE_FAL_FAST_MODEL = LUMA_DREAM_MACHINE_MODEL;
export const SEEDANCE_T2V_MODEL = LUMA_DREAM_MACHINE_T2V;
export const SEEDANCE_I2V_MODEL = LUMA_DREAM_MACHINE_I2V;

function getFalKey(): string {
  const key =
    process.env.FAL_KEY ??
    process.env.FAL_API_KEY ??
    process.env.FALAI_API_KEY ??
    "";
  if (!key) {
    throw new Error("FAL_API_KEY not configured — required for Luma Ray 2 via fal.ai");
  }
  return key;
}

function trimPrompt(prompt: string): string {
  return prompt.trim().slice(0, MAX_PROMPT_CHARS);
}

function mapDuration(secs: number | undefined): LumaDuration {
  const n = secs && secs > 0 ? Math.round(secs) : 5;
  return n >= 8 ? "9s" : "5s";
}

function durationSeconds(d: LumaDuration): number {
  return d === "9s" ? 9 : 5;
}

function mapResolution(res?: string): LumaResolution {
  if (res === "1080p") return "1080p";
  if (res === "480p" || res === "540p") return "540p";
  return "720p";
}

function mapAspectRatio(ar?: string): LumaAspectRatio {
  const allowed: LumaAspectRatio[] = ["9:16", "16:9", "4:3", "3:4", "21:9", "9:21"];
  if (ar && allowed.includes(ar as LumaAspectRatio)) return ar as LumaAspectRatio;
  if (ar === "1:1" || ar === "auto") return "9:16";
  return "9:16";
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

/** Generate cinematic video — Luma Ray 2 via fal.ai only. */
export async function falLumaGenerate(params: FalLumaParams): Promise<FalLumaResult> {
  const startMs = Date.now();
  fal.config({ credentials: getFalKey() });

  const lumaDuration = mapDuration(params.duration);
  const durSecs = durationSeconds(lumaDuration);
  const hasImage = typeof params.imageUrl === "string" && params.imageUrl.startsWith("https://");
  const model = hasImage ? LUMA_DREAM_MACHINE_I2V : LUMA_DREAM_MACHINE_T2V;

  console.log(`[LUMA_DREAM_MACHINE] Generating ${lumaDuration} | i2v=${hasImage} | ${model}`);

  const input = {
    prompt:       trimPrompt(params.prompt),
    duration:     lumaDuration,
    resolution:   mapResolution(params.resolution),
    aspect_ratio: mapAspectRatio(params.aspectRatio),
    loop:         params.loop ?? false,
    ...(hasImage ? { image_url: params.imageUrl! } : {}),
  };

  try {
    const result = await fal.subscribe(model, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      input: input as any,
      pollInterval: POLL_INTERVAL_MS,
      timeout:      SUBSCRIBE_TIMEOUT_MS,
      logs:         false,
    }) as { data?: Record<string, unknown> };

    const videoUrl = extractFalVideoUrl(result?.data);
    const latencyMs = Date.now() - startMs;

    if (!videoUrl) {
      throw new Error(
        `Luma Ray 2 returned no video URL — ${JSON.stringify(result?.data ?? {}).substring(0, 200)}`,
      );
    }

    console.log(`[LUMA_DREAM_MACHINE] ✅ Done in ${latencyMs}ms`);

    return {
      videoUrl,
      duration:     durSecs,
      modelUsed:    model,
      generationMs: latencyMs,
      latencyMs,
      seed:         params.seed,
    };
  } catch (error) {
    const latencyMs = Date.now() - startMs;
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[LUMA_DREAM_MACHINE] Failed after ${latencyMs}ms:`, msg);
    throw error;
  }
}

/** @deprecated Legacy alias — routes to Luma Ray 2. */
export const falSeedanceFastGenerate = async (
  params: FalSeedanceFastParams,
): Promise<FalSeedanceFastResult> => {
  const result = await falLumaGenerate(params);
  return { ...result, costEstimate: "luma-ray2-via-fal" };
};

/** @deprecated Legacy alias — routes to Luma Ray 2. */
export const callSeedance = async (input: SeedanceGenerateInput): Promise<SeedanceGenerateResult> => {
  const result = await falLumaGenerate({
    prompt:      input.prompt,
    imageUrl:    input.imageUrl,
    duration:    input.duration,
    resolution:  input.resolution,
    aspectRatio: input.aspectRatio,
  });
  return {
    url:           result.videoUrl,
    model_used:    result.modelUsed,
    generation_ms: result.generationMs,
    seed:          result.seed,
  };
};