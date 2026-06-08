// Kling generation worker for the parallel orchestration engine.
//
// Uses fal.ai client (already integrated) with Kling v2.1 pro by default.
// Applies visual lock constraints from lib/avatar/model-router.ts.
// Does NOT change lib/providers/hedra.ts — Hedra path is untouched.

import { fal }                    from "@fal-ai/client";
import { KLING_T2V_PRO, KLING_T2V_MODEL, KLING_I2V_PRO, extractVideoUrl } from "@/lib/video-models";
import { VISUAL_LOCK_CONSTRAINTS } from "@/lib/avatar/model-router";

export interface KlingWorkerInput {
  shotId:        string;
  shotNumber:    number;
  visualPrompt:  string;
  modelId?:      string;           // override — fal_model from shots row
  durationSecs?: number;           // from shots.duration_seconds
  aspectRatio?:  string;           // default "9:16"
  characterPromptSuffix?: string;  // appended from character_registry
  brandSuffix?:  string;           // appended from brand memory
  imageUrl?:     string;           // reference image → auto-switches to i2v model
  speedMode?:    string;           // 'ultra-draft' | 'draft' | 'balanced' | 'quality'
}

export interface KlingWorkerResult {
  shotId:          string;
  shotNumber:      number;
  video_url:       string;
  duration_seconds: number;
  model_used:      string;
  generation_ms:   number;
}

// Kling accepts duration as "5" or "10" only
function clampDuration(secs: number | undefined): "5" | "10" {
  if (!secs || secs <= 7) return "5";
  return "10";
}

// Timeout wrapper — prevent Kling from blocking the pipeline indefinitely
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`[kling-worker] timeout after ${ms}ms — ${label}`)), ms)
    ),
  ]);
}

export async function generateKlingClip(input: KlingWorkerInput): Promise<KlingWorkerResult> {
  const startMs  = Date.now();
  const isI2V    = !!input.imageUrl;
  const isDraft  = input.speedMode === 'ultra-draft' || input.speedMode === 'draft';

  // draft/ultra-draft: use v1.6 standard (faster queue); balanced+: v2.1 pro
  const modelId   = input.modelId ?? (isDraft ? KLING_T2V_MODEL : isI2V ? KLING_I2V_PRO : KLING_T2V_PRO);
  // ultra-draft always forces 5s clips; draft honours shot duration
  const duration  = input.speedMode === 'ultra-draft' ? "5" : clampDuration(input.durationSecs);
  const aspectRatio = (input.aspectRatio ?? "9:16") as "9:16" | "16:9" | "1:1";
  // timeout: 90s draft, 180s balanced
  const timeoutMs = isDraft ? 90_000 : 180_000;

  // Build enriched prompt from all memory sources
  const parts: string[] = [input.visualPrompt];
  if (input.characterPromptSuffix) parts.push(input.characterPromptSuffix);
  if (input.brandSuffix)           parts.push(input.brandSuffix);
  parts.push(VISUAL_LOCK_CONSTRAINTS.positive);

  const prompt          = parts.filter(Boolean).join(", ");
  const negative_prompt = VISUAL_LOCK_CONSTRAINTS.negative;

  console.info("[kling-worker] submitting shot", {
    shot_id:    input.shotId,
    model:      modelId,
    mode:       isI2V ? "i2v" : "t2v",
    duration,
    speedMode:  input.speedMode ?? 'balanced',
    timeoutMs,
    prompt_preview: prompt.slice(0, 80),
  });

  let result: unknown;
  try {
    const falInput: Record<string, unknown> = {
      prompt,
      negative_prompt,
      duration,
      aspect_ratio: aspectRatio,
    };
    if (isI2V) falInput.image_url = input.imageUrl;

    result = await withTimeout(
      fal.subscribe(modelId, { input: falInput }),
      timeoutMs,
      `shot=${input.shotId}`,
    );
  } catch (err) {
    throw new Error(
      `[kling-worker] fal.ai error shot=${input.shotId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const video_url = extractVideoUrl(result);
  if (!video_url) {
    throw new Error(`[kling-worker] no video URL in response for shot=${input.shotId}`);
  }

  const generation_ms = Date.now() - startMs;
  console.info(`[KLING_TIMING] shot=${input.shotId} model=${modelId} duration=${duration}s ms=${generation_ms}`);

  return {
    shotId:           input.shotId,
    shotNumber:       input.shotNumber,
    video_url,
    duration_seconds: Number(duration),
    model_used:       modelId,
    generation_ms,
  };
}
