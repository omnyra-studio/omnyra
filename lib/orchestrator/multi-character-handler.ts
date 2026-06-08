// Multi-character scene handler.
//
// Hedra is fundamentally single-character (one image + one audio → one talking head).
// When a scene requires two characters in frame simultaneously, this module:
//   1. Detects the scene as multi-character via keyword matching
//   2. Generates a composite reference image via Flux showing both characters
//   3. Routes to Kling i2v (KLING_I2V_PRO) with the composite as the reference frame
//
// The negative prompt aggressively prevents single-person output from Kling.

import { fal }              from "@fal-ai/client";
import { KLING_I2V_PRO }    from "@/lib/video-models";
import type { CharacterMemory } from "@/lib/memory/character-memory";

// ── Detection ─────────────────────────────────────────────────────────────────

const COUPLE_RE = /\b(couple|two people|both of them|together|partner|dancing with|walking with|holding hands|hand in hand|each other|lovers|husband|wife|boyfriend|girlfriend|fiancee?|spouse|relationship|romance|romantic|he and she|man and woman|dance with her|took her hand|they swayed|beside each other|next to each other)\b/i;
const DUAL_KEYWORDS = /\b(her hand|his arm|dance|kissing|embrace|hug|they\s+walk|they\s+stand|beside\s+her|next\s+to\s+her|swayed together|walked together)\b/i;

export function isMultiCharacterScene(visualPrompt: string): boolean {
  return COUPLE_RE.test(visualPrompt) || DUAL_KEYWORDS.test(visualPrompt);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MultiCharacterInput {
  shotId:       string;
  shotNumber:   number;
  visualPrompt: string;
  char1:        CharacterMemory;
  char2:        CharacterMemory;
  durationSecs?: number;
  aspectRatio?:  string;
  brandSuffix?:  string;
}

export interface MultiCharacterResult {
  shotId:              string;
  shotNumber:          number;
  video_url:           string;
  duration_seconds:    number;
  model_used:          string;
  generation_ms:       number;
  composite_image_url: string;
}

// ── Couple-scene prompt builder ───────────────────────────────────────────────
// Injects both character descriptions into a visual prompt so every generation
// tool (Kling t2v, Kling i2v, Flux) anchors on both people explicitly.

// Anatomy/quality negative — appended to every multi-character Kling/Flux call
export const MULTI_CHAR_NEGATIVE =
  "extra limbs, missing limbs, fused bodies, merged figures, wrong gender, extra person, three people, " +
  "deformed hands, bad anatomy, blurry, low quality, solo person, only one person, single figure, " +
  "cropped person, cut off character, missing face, faceless";

export function buildCoupleScenePrompt(
  sceneDescription: string,
  char1:            CharacterMemory,
  char2:            CharacterMemory,
): string {
  const char1Desc = [char1.core_prompt, char1.visual_signature].filter(Boolean).join(", ");
  const char2Desc = [char2.core_prompt, char2.visual_signature].filter(Boolean).join(", ");

  return (
    `TWO distinct people, clearly separate individuals, both fully visible in frame. ` +
    `Person 1: ${char1Desc}, standing next to Person 2: ${char2Desc}. ` +
    `Scene: ${sceneDescription}. ` +
    `Show BOTH faces clearly, side-by-side, no merging, distinct individuals, full bodies visible. ` +
    `Cinematic golden hour lighting, highly detailed faces and hands, anatomically correct, perfect proportions. ` +
    `${char1.ref_frame_url ? "Exact match to reference image." : ""}`
  ).trim();
}

// ── Composite image via Flux ──────────────────────────────────────────────────

async function generateCompositeImage(
  char1:        CharacterMemory,
  char2:        CharacterMemory,
  sceneContext: string,
): Promise<string> {
  const char1Desc = [char1.core_prompt, char1.visual_signature].filter(Boolean).join(", ");
  const char2Desc = [char2.core_prompt, char2.visual_signature].filter(Boolean).join(", ");

  const compositePrompt = [
    `Two distinct people standing side by side in one cinematic frame: ${sceneContext}.`,
    `Person 1 (left): ${char1Desc}.`,
    `Person 2 (right): ${char2Desc}.`,
    "Both faces fully visible, no merging, clear separation between bodies, photorealistic, cinematic golden hour lighting, 9:16 vertical aspect ratio, high detail.",
  ].join(" ");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (fal.subscribe as any)("fal-ai/flux/schnell", {
    input: {
      prompt:              compositePrompt,
      num_images:          1,
      image_size:          "portrait_4_3",
      num_inference_steps: 8,
    },
  }) as { images?: Array<{ url: string }> };

  const url = result?.images?.[0]?.url;
  if (!url) throw new Error("[multi-character] Flux composite image failed — no URL returned");
  console.info("[multi-character] composite image generated", { url: url.slice(0, 60) });
  return url;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function generateMultiCharacterClip(
  input: MultiCharacterInput,
): Promise<MultiCharacterResult> {
  const startMs    = Date.now();
  const duration   = (input.durationSecs ?? 5) <= 7 ? "5" : "10";
  const aspectRatio = (input.aspectRatio ?? "9:16") as "9:16" | "16:9" | "1:1";

  // Step 1: Composite reference image
  const compositeImageUrl = await generateCompositeImage(
    input.char1,
    input.char2,
    input.visualPrompt,
  );

  // Step 2: Build dual-character Kling i2v prompt using the couple template
  const baseCouplePrompt = buildCoupleScenePrompt(input.visualPrompt, input.char1, input.char2);
  const prompt = input.brandSuffix ? `${baseCouplePrompt}, ${input.brandSuffix}` : baseCouplePrompt;

  const negParts = [
    input.char1.neg_prompt,
    input.char2.neg_prompt,
    MULTI_CHAR_NEGATIVE,
  ].filter(Boolean);
  const negative_prompt = negParts.join(", ");

  console.info("[multi-character] submitting Kling i2v", {
    shot_id:       input.shotId,
    model:         KLING_I2V_PRO,
    composite_url: compositeImageUrl.slice(0, 60),
  });

  let result: unknown;
  try {
    result = await fal.subscribe(KLING_I2V_PRO, {
      input: {
        prompt,
        negative_prompt,
        image_url:    compositeImageUrl,
        duration,
        aspect_ratio: aspectRatio,
      },
    });
  } catch (err) {
    throw new Error(
      `[multi-character] Kling i2v failed shot=${input.shotId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const r = result as Record<string, unknown> | null | undefined;
  const video_url =
    (r?.data as { video?: { url?: string } })?.video?.url ??
    (r?.video as { url?: string })?.url ??
    undefined;

  if (!video_url) throw new Error(`[multi-character] no video URL for shot=${input.shotId}`);

  const generation_ms = Date.now() - startMs;
  console.info("[multi-character] completed", { shot_id: input.shotId, generation_ms });

  return {
    shotId:              input.shotId,
    shotNumber:          input.shotNumber,
    video_url,
    duration_seconds:    Number(duration),
    model_used:          KLING_I2V_PRO,
    generation_ms,
    composite_image_url: compositeImageUrl,
  };
}
