// Visual consistency scorer for character references.
//
// Compares a Flux-generated source image against stored character reference images
// to detect visual drift before (or immediately after) the Kling generation step.
//
// Uses Claude Haiku vision API — no CLIP model, no pgvector required.
// Score 0.0–1.0. Threshold 0.72 = auto-retry recommendation.
//
// Designed for fire-and-forget logging in the cinematic pipeline:
//   void scoreCharacterConsistency(sourceUrl, charId, userId).then(log)

import Anthropic from "@anthropic-ai/sdk";
import { getCharacterReferences } from "./character-memory";

export interface ConsistencyResult {
  score:          number;   // 0.0–1.0
  shouldRetry:    boolean;  // true when score < RETRY_THRESHOLD
  referenceCount: number;
  characterId:    string;
  detail:         string;
}

export const CONSISTENCY_RETRY_THRESHOLD = 0.72;

const MODEL = "claude-haiku-4-5-20251001";

/**
 * Score how well a generated source image matches a character's stored references.
 * Returns null when scoring is not possible (no refs, no API key, bad URL).
 */
export async function scoreCharacterConsistency(
  generatedImageUrl: string,
  characterId:       string,
  userId:            string,
): Promise<ConsistencyResult | null> {
  if (!generatedImageUrl.startsWith("https://")) return null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[CONSISTENCY] ANTHROPIC_API_KEY not set — skipping consistency check");
    return null;
  }

  const refs = await getCharacterReferences(characterId, userId, 3).catch(() => []);
  if (!refs.length) return null;

  const refUrl = refs.find(r => r.is_primary)?.image_url ?? refs[0].image_url;
  if (!refUrl.startsWith("https://")) return null;

  try {
    const client   = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model:      MODEL,
      max_tokens: 16,
      messages:   [{
        role:    "user",
        content: [
          {
            type:   "image",
            source: { type: "url", url: refUrl } as { type: "url"; url: string },
          } as unknown as Anthropic.ImageBlockParam,
          {
            type:   "image",
            source: { type: "url", url: generatedImageUrl } as { type: "url"; url: string },
          } as unknown as Anthropic.ImageBlockParam,
          {
            type: "text",
            text: "Compare these two character images. How visually consistent are they (face, hair, clothing, overall appearance)? Reply with ONLY a decimal 0.0–1.0, nothing else.",
          },
        ],
      }],
    });

    const raw   = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    const score = isFinite(parseFloat(raw)) ? Math.max(0, Math.min(1, parseFloat(raw))) : 0.5;

    const result: ConsistencyResult = {
      score,
      shouldRetry:    score < CONSISTENCY_RETRY_THRESHOLD,
      referenceCount: refs.length,
      characterId,
      detail:         `ref=${refUrl.substring(0, 60)} score=${score.toFixed(2)}`,
    };

    console.log(`[CONSISTENCY] charId=${characterId} score=${score.toFixed(2)} shouldRetry=${result.shouldRetry} refs=${refs.length}`);
    return result;
  } catch (err) {
    console.warn("[CONSISTENCY] vision scoring failed (non-fatal):", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Batch-score multiple source images, returning the average.
 * Scores only the first valid image to keep latency low (<800ms).
 */
export async function batchScoreConsistency(
  generatedImageUrls: string[],
  characterId:        string,
  userId:             string,
): Promise<ConsistencyResult | null> {
  const validUrl = generatedImageUrls.find(u => u?.startsWith("https://"));
  if (!validUrl) return null;
  return scoreCharacterConsistency(validUrl, characterId, userId);
}

/**
 * Compare two image URLs directly — no DB lookup.
 * Used inside generation loops where the reference URL is already known.
 * Returns 0.0–1.0 or null on failure.
 */
export async function scoreImagePair(
  imageUrlA: string,
  imageUrlB: string,
): Promise<number | null> {
  if (!imageUrlA.startsWith("https://") || !imageUrlB.startsWith("https://")) return null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const client   = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model:      MODEL,
      max_tokens: 16,
      messages: [{
        role:    "user",
        content: [
          {
            type:   "image",
            source: { type: "url", url: imageUrlA } as { type: "url"; url: string },
          } as unknown as Anthropic.ImageBlockParam,
          {
            type:   "image",
            source: { type: "url", url: imageUrlB } as { type: "url"; url: string },
          } as unknown as Anthropic.ImageBlockParam,
          {
            type: "text",
            text: "How visually consistent are these two images of the same character (face, hair, clothing)? Reply with ONLY a decimal 0.0–1.0.",
          },
        ],
      }],
    });

    const raw   = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    const score = isFinite(parseFloat(raw)) ? Math.max(0, Math.min(1, parseFloat(raw))) : null;
    return score;
  } catch (err) {
    console.warn("[SCORE_PAIR] failed (non-fatal):", err instanceof Error ? err.message : err);
    return null;
  }
}
