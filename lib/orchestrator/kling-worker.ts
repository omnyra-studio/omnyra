// Kling generation worker for the parallel orchestration engine.
//
// Uses fal.ai client (already integrated) with Kling v2.1 pro by default.
// Applies visual lock constraints from lib/avatar/model-router.ts.
// Does NOT change lib/providers/hedra.ts — Hedra path is untouched.

import { fal }                    from "@fal-ai/client";
import { KLING_T2V_PRO, KLING_T2V_MODEL, KLING_I2V_PRO, extractVideoUrl } from "@/lib/video-models";
import { VISUAL_LOCK_CONSTRAINTS } from "@/lib/avatar/model-router";

// fal SDK reads FAL_KEY; project env may use FAL_API_KEY or FALAI_API_KEY — configure once at module load
const FAL_CREDS = process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY;
if (FAL_CREDS) fal.config({ credentials: FAL_CREDS });
else console.warn("[kling-worker] WARNING: FAL_KEY / FAL_API_KEY / FALAI_API_KEY not set — all Kling calls will fail");

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
  motionStrength?: number;         // 0-1; maps to cfg_scale (inverse)
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

  // always use v2.1 pro — v1.6 standard queue is consistently slower
  const modelId   = input.modelId ?? (isI2V ? KLING_I2V_PRO : KLING_T2V_PRO);
  // ultra-draft always forces 5s clips; draft honours shot duration
  const duration  = input.speedMode === 'ultra-draft' ? "5" : clampDuration(input.durationSecs);
  const aspectRatio = (input.aspectRatio ?? "9:16") as "9:16" | "16:9" | "1:1";
  // timeout: 250s (Kling v1.6 queue can be slow), 280s balanced — within Vercel 300s limit
  const timeoutMs = isDraft ? 250_000 : 280_000;

  // ── Motion tuning ─────────────────────────────────────────────────────────────
  // motionStrength (0-1) maps inversely to cfg_scale: high strength = lower cfg_scale = more motion
  const ms       = input.motionStrength ?? 0.65;
  const cfgScale = parseFloat((1.0 - ms).toFixed(2));  // 0.45→0.55, 0.55→0.45, 0.65→0.35, 0.75→0.25

  const motionModifier   = ms >= 0.70 ? "dynamic fluid motion, high energy movement" : ms <= 0.52 ? "slow motion, gentle movement" : "";
  const extraNegative    = ms >= 0.70 ? "" : "shaky, jittery, unstable";

  console.info(`[MOTION_TUNE] shot=${input.shotId} motionStrength=${ms} cfg_scale=${cfgScale} modifier="${motionModifier}"`);

  // Build enriched prompt from all memory sources
  const parts: string[] = [input.visualPrompt];
  if (motionModifier)              parts.push(motionModifier);
  if (input.characterPromptSuffix) parts.push(input.characterPromptSuffix);
  if (input.brandSuffix)           parts.push(input.brandSuffix);
  parts.push(VISUAL_LOCK_CONSTRAINTS.positive);

  const prompt          = parts.filter(Boolean).join(", ");
  const negParts        = [VISUAL_LOCK_CONSTRAINTS.negative, extraNegative].filter(Boolean);
  const negative_prompt = negParts.join(", ");

  console.info("[kling-worker] submitting shot", {
    shot_id:    input.shotId,
    model:      modelId,
    mode:       isI2V ? "i2v" : "t2v",
    duration,
    speedMode:  input.speedMode ?? 'balanced',
    cfg_scale:  cfgScale,
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
      cfg_scale:    cfgScale,
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
