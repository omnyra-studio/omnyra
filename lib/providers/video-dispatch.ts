/**
 * Provider router — all video routes to Atlas Cloud Seedance v1.5 Fast.
 * Luma and Kling are no longer supported.
 */

import { generateVideoClip } from "./atlasCloud";

export type VideoDispatchProvider = "seedance" | "luma" | "kling";

export interface VideoDispatchParams {
  prompt:       string;
  imageUrl?:    string | null;
  duration?:    number;
  resolution?:  string;
  aspectRatio?: string;
  /** Legacy compat — not used by Atlas Cloud (conveyed via prompt). */
  motionStrength?: string;
  generateAudio?:  boolean;
  seed?:           number;
  sceneNumber?:    number;
}

export interface VideoDispatchResult {
  videoUrl:      string;
  duration:      number;
  modelUsed:     string;
  generationMs:  number;
  latencyMs:     number;
  seed?:         number;
  costEstimate?: string;
}

export async function generateVideoByProvider(
  provider: VideoDispatchProvider,
  params: VideoDispatchParams,
): Promise<VideoDispatchResult> {
  switch (provider) {
    case "seedance":
      return dispatchAtlas(params);
    case "luma":
      throw new Error("Luma video dispatch removed — all video uses Atlas Cloud Seedance.");
    case "kling":
      throw new Error("Kling video dispatch removed — all video uses Atlas Cloud Seedance.");
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown video provider: ${_exhaustive}`);
    }
  }
}

async function dispatchAtlas(params: VideoDispatchParams): Promise<VideoDispatchResult> {
  const durationSec = params.duration ?? 5;
  const seed = params.seed ?? (Date.now() % 999_999_999);
  const aspectRatio = (params.aspectRatio === "16:9" || params.aspectRatio === "1:1")
    ? params.aspectRatio
    : "9:16";
  const resolution = params.resolution === "480p" ? "480p" : "720p";

  console.log(`[guardrail] provider=seedance-atlas-fast scene=${params.sceneNumber ?? "?"} mode=${params.imageUrl ? "i2v" : "t2v"}`);

  const result = await generateVideoClip(
    params.imageUrl?.startsWith("https://") ? params.imageUrl : undefined,
    params.prompt,
    durationSec,
    seed,
    {
      aspectRatio,
      resolution,
      sceneNumber: params.sceneNumber,
    },
  );

  return {
    videoUrl:    result.videoUrl,
    duration:    durationSec,
    modelUsed:   result.modelUsed,
    generationMs: result.generationMs,
    latencyMs:   result.generationMs,
    seed:        result.seed,
  };
}
