/**
 * Luma Dream Machine (Ray 2) cinematic video via fal.ai — sole video provider.
 * Endpoints: fal-ai/luma-dream-machine/ray-2 (+ image-to-video)
 * Auth: FAL_API_KEY (Luma is proxied through fal.ai, not LUMA_API_KEY directly)
 */

import { fal } from "@fal-ai/client";
import { assertProviderModel, logFalRequest } from "./fal-guard";
import { formatFalError, logFalError, logFalPayload } from "./fal-errors";

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
  sceneNumber?: number;
}

export interface FalLumaResult {
  videoUrl: string;
  duration: number;
  modelUsed: string;
  generationMs: number;
  latencyMs: number;
  seed?: number;
}

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

/** Strip bracket directives — Luma expects natural-language cinematic prompts. */
export function sanitizeLumaPrompt(raw: string): string {
  let text = raw.trim();

  text = text.replace(/\[MANDATORY ETHNICITY OVERRIDE\][\s\S]*?(?=\[|$)/gi, "");
  text = text.replace(/\[ETHNICITY DEFAULT RULE[^\]]*\][\s\S]*?(?=\[|$)/gi, "");
  text = text.replace(/\[(?:ETHNICITY|MANDATORY STRONG MOTION|MOTION REQUIREMENT|CRITICAL)[^\]]*\]/gi, "");
  text = text.replace(/\[[^\]]{2,}\]/g, "");
  text = text.replace(/\s+/g, " ").trim();

  if (text.length < 20) return raw.trim().slice(0, MAX_PROMPT_CHARS);

  if (!/\bcaucasian\b/i.test(text)) {
    text = `Photorealistic cinematic scene, Caucasian subjects with Western European features. ${text}`;
  }

  return text.slice(0, MAX_PROMPT_CHARS);
}

function trimPrompt(prompt: string): string {
  return sanitizeLumaPrompt(prompt);
}

/** Verify image is fetchable; re-upload to fal storage when host blocks hotlinking. */
async function resolveLumaImageUrl(imageUrl: string): Promise<string | undefined> {
  const url = imageUrl.trim();
  if (!url.startsWith("https://")) return undefined;

  try {
    const head = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (head.ok) return url;
  } catch { /* try upload */ }

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.warn(`[LUMA_DREAM_MACHINE] image fetch failed HTTP ${res.status} — using T2V`);
      return undefined;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 500) return undefined;

    const ext = url.includes(".png") ? "png" : "jpg";
    const file = new File(
      [buf],
      `luma-scene.${ext}`,
      { type: ext === "png" ? "image/png" : "image/jpeg" },
    );
    const uploaded = await fal.storage.upload(file);
    if (typeof uploaded === "string" && uploaded.startsWith("https://")) {
      console.log(`[LUMA_DREAM_MACHINE] image re-uploaded to fal storage`);
      return uploaded;
    }
  } catch (err) {
    console.warn(
      `[LUMA_DREAM_MACHINE] image resolve failed — using T2V:`,
      err instanceof Error ? err.message : err,
    );
  }

  return undefined;
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

  let resolvedImageUrl: string | undefined;
  if (typeof params.imageUrl === "string" && params.imageUrl.startsWith("https://")) {
    if (params.imageUrl.includes("fal.media") || params.imageUrl.includes("fal.run")) {
      resolvedImageUrl = params.imageUrl;
    } else {
      resolvedImageUrl = await resolveLumaImageUrl(params.imageUrl);
    }
  }

  const useI2V = !!resolvedImageUrl;
  const model = useI2V ? LUMA_DREAM_MACHINE_I2V : LUMA_DREAM_MACHINE_T2V;
  const safePrompt = trimPrompt(params.prompt);

  assertProviderModel("luma", model);
  logFalRequest({
    provider:    "luma",
    model,
    endpoint:    model,
    sceneNumber: params.sceneNumber,
    duration:    lumaDuration,
  });

  console.log(
    `[LUMA_DREAM_MACHINE] Generating ${lumaDuration} | i2v=${useI2V} | ${model} | prompt="${safePrompt.slice(0, 80)}..."`,
  );

  const input: Record<string, unknown> = {
    prompt:       safePrompt,
    duration:     lumaDuration,
    resolution:   mapResolution(params.resolution),
    aspect_ratio: mapAspectRatio(params.aspectRatio),
  };
  if (params.loop) input.loop = true;
  if (useI2V && resolvedImageUrl) input.image_url = resolvedImageUrl;

  logFalPayload(`scene=${params.sceneNumber ?? "?"} i2v=${useI2V}`, model, input);

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
    logFalError(`LUMA_DREAM_MACHINE scene=${params.sceneNumber ?? "?"}`, error, latencyMs);
    throw new Error(formatFalError(error));
  }
}