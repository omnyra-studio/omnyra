/**
 * Strict provider router — Seedance and Luma never cross-call.
 */

import { falSeedanceFastGenerate } from "./seedance";
import { falLumaGenerate } from "./luma";
import type { SeedanceMotionStrength } from "./seedance";
import type { LumaAspectRatio, LumaResolution } from "./luma";

export type VideoDispatchProvider = "seedance" | "luma" | "kling";

export interface VideoDispatchParams {
  prompt:          string;
  imageUrl?:       string | null;
  duration?:       number;
  resolution?:     string;
  aspectRatio?:    string;
  motionStrength?: SeedanceMotionStrength;
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
      return dispatchSeedance(params);
    case "luma":
      return dispatchLuma(params);
    case "kling":
      throw new Error("Kling video dispatch is not wired — use kling-direct or explicit kling route.");
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown video provider: ${_exhaustive}`);
    }
  }
}

async function dispatchSeedance(params: VideoDispatchParams): Promise<VideoDispatchResult> {
  const result = await falSeedanceFastGenerate({
    prompt:         params.prompt,
    imageUrl:       params.imageUrl,
    duration:       params.duration,
    resolution:     (params.resolution === "480p" || params.resolution === "720p")
      ? params.resolution
      : "720p",
    aspectRatio:    (params.aspectRatio as "9:16" | "16:9" | "1:1" | "auto" | undefined) ?? "9:16",
    generateAudio:  params.generateAudio ?? false,
    motionStrength: params.motionStrength ?? "high",
    seed:           params.seed,
    sceneNumber:    params.sceneNumber,
  });

  return {
    videoUrl:     result.videoUrl,
    duration:     result.duration,
    modelUsed:    result.modelUsed,
    generationMs: result.generationMs,
    latencyMs:    result.latencyMs,
    seed:         result.seed,
    costEstimate: result.costEstimate,
  };
}

async function dispatchLuma(params: VideoDispatchParams): Promise<VideoDispatchResult> {
  const result = await falLumaGenerate({
    prompt:      params.prompt,
    imageUrl:    params.imageUrl,
    duration:    params.duration,
    resolution:  params.resolution as LumaResolution | "480p" | undefined,
    aspectRatio: params.aspectRatio as LumaAspectRatio | "1:1" | "auto" | undefined,
    seed:        params.seed,
    sceneNumber: params.sceneNumber,
  });

  return {
    videoUrl:     result.videoUrl,
    duration:     result.duration,
    modelUsed:    result.modelUsed,
    generationMs: result.generationMs,
    latencyMs:    result.latencyMs,
    seed:         result.seed,
  };
}