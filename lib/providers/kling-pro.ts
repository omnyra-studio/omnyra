/**
 * Kling 2.6 Pro via fal.ai — single-shot and multi-shot variants.
 * Model: fal-ai/kling-video/v2.6/pro/image-to-video
 * Cost: ~$0.084/s × 10s = ~$0.84 USD per clip (~$1.30 AUD).
 * Timeout: 200s. One retry on timeout with new seed.
 */

import { fal } from "@fal-ai/client";

const MODEL            = "fal-ai/kling-video/v2.6/pro/image-to-video";
const TIMEOUT_MS       = 200_000;
const POLL_INTERVAL_MS = 2_000;
const MAX_PROMPT_CHARS = 2500;

export interface KlingSingleShotParams {
  prompt:          string;
  negativePrompt?: string;
  imageUrl?:       string;
  duration?:       "5" | "10";
  aspectRatio?:    "9:16" | "16:9" | "1:1";
  seed?:           number;
  sceneNumber?:    number;
  cfgScale?:       number;
}

export interface KlingProMultiShotParams {
  scenePrompts:   string[];
  startImageUrl?: string;
  duration?:      "5" | "10";
  aspectRatio?:   "9:16" | "16:9" | "1:1";
}

export interface KlingProResult {
  videoUrl:     string;
  modelUsed:    string;
  generationMs: number;
  promptSent:   string;
}

function getFalKey(): string {
  const key = process.env.FAL_API_KEY ?? process.env.FAL_KEY ?? process.env.FALAI_API_KEY ?? "";
  if (!key) throw new Error("FAL_API_KEY not configured — required for Kling 2.6 Pro");
  return key;
}

/**
 * Build a multi-shot prompt from an array of director-prose scene descriptions.
 * Format: "[scene1]. Shot 2: [scene2]. Shot 3: [scene3]."
 */
export function buildKlingMultiShotPrompt(scenePrompts: string[]): string {
  const cleaned = scenePrompts.map(p =>
    p.trim().replace(/\s+/g, " ").replace(/\.$/, ""),
  );

  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return `${cleaned[0]}.`;

  const parts = cleaned.map((scene, i) =>
    i === 0 ? scene : `Shot ${i + 1}: ${scene}`,
  );

  return parts.join(". ").slice(0, MAX_PROMPT_CHARS) + ".";
}

function extractKlingVideoUrl(data: Record<string, unknown> | undefined): string | undefined {
  if (!data) return undefined;

  const video = data.video;
  if (typeof video === "string" && video.startsWith("http")) return video;
  if (video && typeof video === "object" && !Array.isArray(video)) {
    const url = (video as { url?: string }).url;
    if (url?.startsWith("http")) return url;
  }

  if (typeof data.video_url === "string" && data.video_url.startsWith("http")) return data.video_url;
  if (typeof data.url === "string" && data.url.startsWith("http")) return data.url;

  const videos = data.videos;
  if (Array.isArray(videos) && videos.length > 0) {
    const first = videos[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") return (first as { url?: string }).url;
  }

  return undefined;
}

async function klingSubscribe(
  prompt:          string,
  imageUrl:        string | undefined,
  duration:        "5" | "10",
  aspectRatio:     "9:16" | "16:9" | "1:1",
  seed:            number,
  cfgScale:        number,
  negativePrompt?: string,
): Promise<string> {
  const input: Record<string, unknown> = {
    prompt:          prompt.slice(0, MAX_PROMPT_CHARS),
    duration,
    aspect_ratio:    aspectRatio,
    generate_audio:  false,
    cfg_scale:       cfgScale,
    seed,
  };
  if (negativePrompt?.trim()) {
    input.negative_prompt = negativePrompt.slice(0, 500);
  }
  if (imageUrl?.startsWith("https://")) {
    input.start_image_url = imageUrl;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await fal.subscribe(MODEL, {
    input: input as any,
    pollInterval: POLL_INTERVAL_MS,
    timeout:      TIMEOUT_MS,
    logs:         false,
  }) as { data?: Record<string, unknown> };

  const videoUrl = extractKlingVideoUrl(result?.data);
  if (!videoUrl) {
    throw new Error(`[KLING_ERROR] no video URL in response: ${JSON.stringify(result?.data ?? {}).substring(0, 200)}`);
  }
  return videoUrl;
}

/**
 * Single-scene Kling 2.6 Pro generation — one call returns one clip.
 * Use this for parallel per-scene generation (3 calls in Promise.all).
 */
export async function generateKlingSingleShot(
  params: KlingSingleShotParams,
): Promise<KlingProResult> {
  const startMs    = Date.now();
  const key        = getFalKey();
  fal.config({ credentials: key });

  const duration    = params.duration    ?? "10";
  const aspectRatio = params.aspectRatio ?? "9:16";
  const cfgScale    = params.cfgScale    ?? 0.5;
  const seed        = params.seed        ?? (Date.now() % 999_999_999);
  const scene       = params.sceneNumber ?? "?";
  const mode        = params.imageUrl ? "i2v" : "t2v";

  console.log(`[KLING_REQUEST] scene=${scene} model=${MODEL} mode=${mode} duration=${duration}s seed=${seed}`);
  console.log(`[KLING_PROMPT] scene=${scene}: ${params.prompt.substring(0, 200)}`);
  if (params.imageUrl) console.log(`[KLING_IMAGE] scene=${scene}: ${params.imageUrl.substring(0, 80)}`);

  const tryGenerate = async (retrySeed: number): Promise<string> => {
    try {
      return await klingSubscribe(params.prompt, params.imageUrl, duration, aspectRatio, retrySeed, cfgScale, params.negativePrompt);
    } catch (err) {
      const elapsed = Date.now() - startMs;
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes("timeout") || msg.includes("TIMEOUT") || elapsed >= TIMEOUT_MS - 5_000;
      if (isTimeout) {
        console.warn(`[KLING_TIMEOUT] scene=${scene} elapsed=${Math.round(elapsed / 1000)}s — retrying with seed=${retrySeed + 1}`);
        return await klingSubscribe(params.prompt, params.imageUrl, duration, aspectRatio, retrySeed + 1, cfgScale, params.negativePrompt);
      }
      throw new Error(`[KLING_ERROR] scene=${scene}: ${msg}`);
    }
  };

  const videoUrl    = await tryGenerate(seed);
  const generationMs = Date.now() - startMs;

  console.log(`[KLING_DONE] scene=${scene} elapsed=${Math.round(generationMs / 1000)}s url=${videoUrl.substring(0, 80)}`);

  return {
    videoUrl,
    modelUsed:    "kling-2.6-pro",
    generationMs,
    promptSent:   params.prompt,
  };
}

/**
 * Multi-shot Kling 2.6 Pro generation — all scenes in one call via prompt labels.
 * One call returns one ~10s video.
 * Less reliable for human subject consistency; prefer generateKlingSingleShot in parallel.
 */
export async function generateKlingProMultiShot(
  params: KlingProMultiShotParams,
): Promise<KlingProResult> {
  const startMs  = Date.now();
  const key      = getFalKey();
  fal.config({ credentials: key });

  const prompt      = buildKlingMultiShotPrompt(params.scenePrompts);
  const duration    = params.duration    ?? "10";
  const aspectRatio = params.aspectRatio ?? "9:16";
  const seed        = Date.now() % 999_999_999;

  console.log(`[KLING_MULTISHOT] model=${MODEL} duration=${duration} scenes=${params.scenePrompts.length}`);
  console.log(`[KLING_PROMPT] multishot="${prompt.substring(0, 200)}"`);

  const tryGenerate = async (retrySeed: number): Promise<string> => {
    try {
      return await klingSubscribe(prompt, params.startImageUrl, duration, aspectRatio, retrySeed, 0.5);
    } catch (err) {
      const elapsed = Date.now() - startMs;
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes("timeout") || msg.includes("TIMEOUT") || elapsed >= TIMEOUT_MS - 5_000;
      if (isTimeout) {
        console.warn(`[KLING_TIMEOUT] multishot elapsed=${Math.round(elapsed / 1000)}s — retrying`);
        return await klingSubscribe(prompt, params.startImageUrl, duration, aspectRatio, retrySeed + 1, 0.5);
      }
      throw new Error(`[KLING_ERROR] multishot: ${msg}`);
    }
  };

  const videoUrl    = await tryGenerate(seed);
  const generationMs = Date.now() - startMs;

  console.log(`[KLING_DONE] multishot elapsed=${Math.round(generationMs / 1000)}s`);

  return {
    videoUrl,
    modelUsed:    "kling-2.6-pro",
    generationMs,
    promptSent:   prompt,
  };
}
