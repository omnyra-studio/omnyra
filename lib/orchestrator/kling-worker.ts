// Kling generation worker for the parallel orchestration engine.
//
// Uses fal.ai client (already integrated) with Kling v3 pro by default.
// Applies visual lock constraints from lib/avatar/model-router.ts.
// Does NOT change lib/providers/hedra.ts — Hedra path is untouched.

import { fal }                    from "@fal-ai/client";
import { KLING_T2V_PRO, KLING_T2V_MODEL, KLING_I2V_PRO, KLING_I2V_MODEL, extractVideoUrl } from "@/lib/video-models";
import { VISUAL_LOCK_CONSTRAINTS } from "@/lib/avatar/model-router";
import type { CharacterReference } from "@/lib/memory/types";

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
  imageUrl?:     string;           // primary reference image → auto-switches to i2v model
  characterReferences?: CharacterReference[]; // ranked refs: worker picks highest quality_score
  speedMode?:    string;           // 'ultra-draft' | 'draft' | 'balanced' | 'quality'
  motionStrength?: number;         // 0-1; maps to cfg_scale (inverse)
  isStylized?:   boolean;          // cartoon/furry/creature — affects neg prompts
  negativePrompt?: string;         // explicit negative override — replaces computed negative when set
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
  const startMs = Date.now();

  // Pick best reference: characterReferences ranked by quality_score wins over bare imageUrl
  const resolvedImageUrl: string | undefined =
    input.characterReferences?.length
      ? (input.characterReferences
          .filter(r => r.is_approved && r.image_url.startsWith("https://"))
          .sort((a, b) => b.quality_score - a.quality_score)[0]?.image_url
         ?? input.imageUrl)
      : input.imageUrl;

  if (resolvedImageUrl && resolvedImageUrl !== input.imageUrl) {
    console.info(`[KLING_REF_SELECT] shot=${input.shotId} using best approved reference quality_score=${
      input.characterReferences!.find(r => r.image_url === resolvedImageUrl)?.quality_score?.toFixed(2) ?? "?"
    }`);
  }

  const isI2V       = !!resolvedImageUrl;
  const isUltraDraft = input.speedMode === 'ultra-draft';
  const isDraft      = isUltraDraft || input.speedMode === 'draft';

  // ultra-draft → v3 standard (faster queue); draft/balanced/quality → v3 pro
  const defaultT2V = isUltraDraft ? KLING_T2V_MODEL : KLING_T2V_PRO;
  const defaultI2V = isUltraDraft ? KLING_I2V_MODEL : KLING_I2V_PRO;
  const modelId    = input.modelId ?? (isI2V ? defaultI2V : defaultT2V);
  // ultra-draft: honor explicit durationSecs when provided; default "5" when caller omits it
  const duration    = (isUltraDraft && !input.durationSecs) ? "5" : clampDuration(input.durationSecs);
  const aspectRatio = (input.aspectRatio ?? "9:16") as "9:16" | "16:9" | "1:1";
  // ultra-draft 90s (standard queue, shorter clips), draft 200s, balanced 260s — within Vercel 300s
  const timeoutMs   = isUltraDraft ? 90_000 : isDraft ? 200_000 : 260_000;

  // ── Motion tuning ─────────────────────────────────────────────────────────────
  // motionStrength (0-1) maps inversely to cfg_scale: higher strength = lower cfg_scale = more motion.
  // Stylized characters (cartoon/furry/creature) use a clamped range to avoid artifact spiral
  // when the model has to maintain complex textures (feathers, fur, stitching) while animating.
  const ms = input.motionStrength ?? (input.isStylized ? 0.55 : 0.62);

  // Stylized: clamp 0.40-0.65 — below 0.40 model generates static; above 0.65 artifacts spiral
  // Realistic: clamp 0.35-0.75 — full dynamic range is safe for human anatomy
  const clampedMs  = input.isStylized
    ? Math.max(0.40, Math.min(0.65, ms))
    : Math.max(0.35, Math.min(0.75, ms));
  const cfgScale   = parseFloat((1.0 - clampedMs).toFixed(2));

  // Motion modifier words injected into positive prompt
  let motionModifier = "";
  if (input.isStylized) {
    if (clampedMs >= 0.58)      motionModifier = "smooth rhythmic motion, character moving naturally, fluid animation";
    else if (clampedMs <= 0.48) motionModifier = "gentle subtle motion, slight movement";
    else                        motionModifier = "steady motion, consistent movement";
  } else {
    if (clampedMs >= 0.68)      motionModifier = "dynamic fluid motion, high energy movement, cinematic action";
    else if (clampedMs <= 0.52) motionModifier = "slow gentle movement, subtle motion";
  }

  // Negative prompts — base + anatomy guards + stylized-specific character corruption guards
  const negBase      = VISUAL_LOCK_CONSTRAINTS.negative;
  const negAnatomy   =
    "extra limbs, extra fingers, extra arms, extra hands, mutated hands, deformed hands, " +
    "fused fingers, too many fingers, missing fingers, ugly hands, distorted limbs, " +
    "bad anatomy, extra legs, malformed limbs, three hands, two left hands, " +
    "overlapping limbs, fused bodies, merged torsos, anatomical errors";
  const negStylized  = input.isStylized
    ? "melting fur, melting feathers, fused limbs, wrong proportions, extra heads, three legs, deformed beak, corrupted plumage, anatomy mutation, uncanny valley, realistic skin on cartoon character, photorealistic, live action, real people, documentary style, 35mm film, human actors, photo, photograph"
    : "";
  const negMotion    = clampedMs < 0.52 ? "shaky, jittery, unstable camera" : "";
  // Caller may supply an explicit override (e.g. animation-specific negatives from parallel engine)
  const negative_prompt = input.negativePrompt
    ? input.negativePrompt
    : [negBase, negAnatomy, negStylized, negMotion].filter(Boolean).join(", ");

  console.info(`[MOTION_TUNE] shot=${input.shotId} motionStrength=${ms} clamped=${clampedMs} cfg_scale=${cfgScale} stylized=${input.isStylized ?? false} modifier="${motionModifier}"`);

  // Build enriched positive prompt
  // Animated/stylized: ensure the Disney/Pixar style descriptor is in the prompt.
  // run-cinematic injects it upstream; this is a fallback so parallel-engine path also gets it.
  let visualPromptFinal = input.visualPrompt;
  if (input.isStylized) {
    const hasAnimStyle = /\b(disney|pixar|animated|cartoon|3d animation|cgi)\b/i.test(input.visualPrompt);
    if (!hasAnimStyle) {
      visualPromptFinal =
        "Highly detailed 3D Disney Pixar style animation, vibrant colors, stylized cartoon characters, expressive faces, cinematic lighting, " +
        input.visualPrompt;
    }
  }
  const parts: string[] = [visualPromptFinal];
  if (motionModifier)              parts.push(motionModifier);
  if (input.characterPromptSuffix) parts.push(input.characterPromptSuffix);
  if (input.brandSuffix)           parts.push(input.brandSuffix);
  parts.push(VISUAL_LOCK_CONSTRAINTS.positive);

  const prompt = parts.filter(Boolean).join(", ");

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
    if (isI2V) falInput.image_url = resolvedImageUrl;

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
