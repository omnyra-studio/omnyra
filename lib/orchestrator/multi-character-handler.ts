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

const COUPLE_RE = /\b(couple|two people|both of them|together|partner|dancing with|walking with|holding hands|hand in hand|each other|lovers|husband|wife|boyfriend|girlfriend|fiancee?|spouse|relationship|romance|romantic)\b/i;
const DUAL_KEYWORDS = /\b(her|his\s+arm|dance|kissing|embrace|hug|they\s+walk|they\s+stand|beside\s+her|next\s+to\s+her)\b/i;

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

export function buildCoupleScenePrompt(
  sceneDescription: string,
  char1:            CharacterMemory,
  char2:            CharacterMemory,
): string {
  const char1Desc = [char1.core_prompt, char1.visual_signature].filter(Boolean).join(", ");
  const char2Desc = [char2.core_prompt, char2.visual_signature].filter(Boolean).join(", ");

  return `Generate a romantic couple scene with BOTH characters clearly visible: ${sceneDescription}. Man: ${char1Desc}. Woman: ${char2Desc}. Action: ${sceneDescription}. Rules: BOTH people must be in frame and interacting, show their faces and bodies clearly, romantic dancing or holding hands or embracing. Negative: solo man, only one person, missing woman, single figure.`;
}

// ── Composite image via Flux ──────────────────────────────────────────────────

async function generateCompositeImage(
  char1:        CharacterMemory,
  char2:        CharacterMemory,
  sceneContext: string,
): Promise<string> {
  const compositePrompt = [
    `Two people together in one cinematic scene: ${sceneContext}.`,
    `Person 1: ${char1.core_prompt}${char1.visual_signature ? ", " + char1.visual_signature : ""}.`,
    `Person 2: ${char2.core_prompt}${char2.visual_signature ? ", " + char2.visual_signature : ""}.`,
    "Both clearly visible in frame, side by side, photorealistic, cinematic lighting, high quality, 9:16 aspect ratio.",
  ].join(" ");

  const result = await fal.subscribe("fal-ai/flux/schnell", {
    input: {
      prompt:               compositePrompt,
      num_images:           1,
      image_size:           "portrait_4_3",
      num_inference_steps:  4,
    },
  }) as { images?: Array<{ url: string }> };

  const url = result?.images?.[0]?.url;
  if (!url) throw new Error("[multi-character] Flux composite image failed — no URL returned");
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

  // Strong negative prompt — prevent Kling from dropping one character
  const negParts = [
    input.char1.neg_prompt,
    input.char2.neg_prompt,
    "solo person, only man, only woman, missing person, single figure, one person only, cropped person, cut off character",
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
