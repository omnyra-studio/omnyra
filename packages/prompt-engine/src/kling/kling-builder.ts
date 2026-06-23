import type { ContinuitySnapshot } from "@omnyra/continuity-engine";
import { buildPromptFromSnapshot } from "@omnyra/continuity-engine";

export interface KlingPromptOptions {
  maxLength?:       number;   // default 500
  includeNegative?: boolean;
}

const NEGATIVE_BASE =
  "blur, low quality, watermark, text overlay, extra limbs, deformed anatomy, " +
  "sand from mouth, particles from mouth, liquid from face, glowing eyes, " +
  "supernatural aura, body horror, unstable motion, back of head";

/**
 * Build the final Kling i2v prompt from a ContinuitySnapshot.
 * All content derived from structured state — no freeform concatenation.
 */
export function buildKlingPrompt(
  snapshot:   ContinuitySnapshot,
  options:    KlingPromptOptions = {},
): string {
  const max = options.maxLength ?? 500;
  return buildPromptFromSnapshot(snapshot).slice(0, max);
}

export function buildKlingNegativePrompt(snapshot: ContinuitySnapshot): string {
  const brand = snapshot.brand.characters[0];
  const extras = brand
    ? `, different face than ${brand.appearanceLock.face}, outfit change`
    : "";
  return NEGATIVE_BASE + extras;
}

export interface KlingJobParams {
  model_name:      "kling-v2-1";
  mode:            "pro";
  image_url:       string;
  prompt:          string;
  negative_prompt: string;
  duration:        string;
  aspect_ratio:    string;
  cfg_scale:       number;
}

/**
 * Assemble the full Kling API request body from a snapshot.
 */
export function buildKlingJobParams(
  snapshot:    ContinuitySnapshot,
  imageUrl:    string,
  aspectRatio: string = "9:16",
  durationSec: number = 10,
): KlingJobParams {
  return {
    model_name:      "kling-v2-1",
    mode:            "pro",
    image_url:       imageUrl,
    prompt:          buildKlingPrompt(snapshot),
    negative_prompt: buildKlingNegativePrompt(snapshot),
    duration:        String(durationSec),
    aspect_ratio:    aspectRatio,
    cfg_scale:       0.5,
  };
}
