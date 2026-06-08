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

export async function generateKlingClip(input: KlingWorkerInput): Promise<KlingWorkerResult> {
  const startMs   = Date.now();
  const isI2V     = !!input.imageUrl;
  // i2v: use KLING_I2V_PRO unless shot overrides; t2v: use KLING_T2V_PRO
  const modelId   = input.modelId ?? (isI2V ? KLING_I2V_PRO : KLING_T2V_PRO);
  const duration  = clampDuration(input.durationSecs);
  const aspectRatio = (input.aspectRatio ?? "9:16") as "9:16" | "16:9" | "1:1";

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

    result = await fal.subscribe(modelId, { input: falInput });
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
  console.info("[kling-worker] completed shot", { shot_id: input.shotId, generation_ms });

  return {
    shotId:           input.shotId,
    shotNumber:       input.shotNumber,
    video_url,
    duration_seconds: Number(duration),
    model_used:       modelId,
    generation_ms,
  };
}
