// Reference image quality scorer for Character Memory.
//
// Assesses how suitable a stored reference image is as a Kling i2v input.
// Uses Claude Haiku vision API — no ffmpeg or CLIP model required.
//
// Scoring dimensions (all 0.0–1.0):
//   clarity      — sharpness, resolution, character detail
//   pose_utility — front-facing, good angle for i2v conditioning
//   lighting     — quality of lighting for generation reuse
//   artifact     — absence of AI artifacts / corruption
//   overall      — weighted average
//
// Auto-approval threshold: 0.70

import Anthropic from "@anthropic-ai/sdk";
import type { ReferenceQualityResult } from "./types";

export const AUTO_APPROVE_THRESHOLD = 0.70;

const MODEL = "claude-haiku-4-5-20251001";

const QUALITY_PROMPT = `You are a video generation quality assessor. Score this reference image on how well it will work as a Kling image-to-video conditioning input.

Score each dimension 0.0–1.0:
- clarity: sharpness, resolution, clear character detail
- pose_utility: front-facing portrait, suitable angle for i2v (1.0 = perfect front-facing, 0.5 = profile, 0.0 = back/obscured)
- lighting: natural, cinematic, or soft lighting quality
- artifact: absence of AI artifacts, melting, deformation (1.0 = no artifacts)

Reply with ONLY valid JSON, no markdown:
{"clarity":0.0,"pose_utility":0.0,"lighting":0.0,"artifact":0.0,"reason":"one sentence"}`;

/**
 * Score a single reference image for its quality as a Kling i2v conditioning input.
 * Non-blocking — call fire-and-forget or await for immediate decisions.
 */
export async function scoreReferenceQuality(
  imageUrl:   string,
  isStylized = false,
): Promise<ReferenceQualityResult | null> {
  if (!imageUrl.startsWith("https://")) return null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[REF_QUALITY] ANTHROPIC_API_KEY not set — skipping quality score");
    return null;
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model:      MODEL,
      max_tokens: 128,
      messages: [{
        role:    "user",
        content: [
          {
            type:   "image",
            source: { type: "url", url: imageUrl } as { type: "url"; url: string },
          } as unknown as Anthropic.ImageBlockParam,
          { type: "text", text: QUALITY_PROMPT },
        ],
      }],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : "{}";

    let parsed: {
      clarity?: number; pose_utility?: number; lighting?: number; artifact?: number; reason?: string;
    } = {};
    try {
      // Strip markdown fences if present
      const json = raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
      parsed = JSON.parse(json);
    } catch {
      console.warn("[REF_QUALITY] failed to parse response:", raw.substring(0, 80));
      return null;
    }

    const clarity      = clamp(parsed.clarity      ?? 0.5);
    const pose_utility = clamp(parsed.pose_utility ?? 0.5);
    const lighting     = clamp(parsed.lighting     ?? 0.5);
    const artifact     = clamp(parsed.artifact     ?? 0.5);

    // Stylized characters get a small bonus on pose_utility (any clear view works well)
    const adjustedPose = isStylized ? Math.min(1, pose_utility + 0.05) : pose_utility;

    // Weighted: pose_utility matters most for i2v, artifact second
    const overall = clamp(
      0.25 * clarity +
      0.35 * adjustedPose +
      0.20 * lighting +
      0.20 * artifact,
    );

    const result: ReferenceQualityResult = {
      imageUrl,
      score:      overall,
      metrics:    { clarity, pose_utility, lighting, artifact, overall },
      isApproved: overall >= AUTO_APPROVE_THRESHOLD,
      reason:     parsed.reason ?? "",
    };

    console.log(
      `[REF_QUALITY] score=${overall.toFixed(2)} approved=${result.isApproved} ` +
      `clarity=${clarity.toFixed(2)} pose=${pose_utility.toFixed(2)} ` +
      `lighting=${lighting.toFixed(2)} artifact=${artifact.toFixed(2)} ` +
      `url=${imageUrl.substring(0, 60)}`,
    );

    return result;
  } catch (err) {
    console.warn("[REF_QUALITY] scoring failed (non-fatal):", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Score a batch of reference images and return results sorted by score descending.
 * Runs all requests in parallel for speed.
 */
export async function batchScoreReferences(
  imageUrls:  string[],
  isStylized = false,
): Promise<ReferenceQualityResult[]> {
  const results = await Promise.allSettled(
    imageUrls.filter(u => u.startsWith("https://")).map(url => scoreReferenceQuality(url, isStylized)),
  );
  return results
    .filter((r): r is PromiseFulfilledResult<ReferenceQualityResult> => r.status === "fulfilled" && r.value !== null)
    .map(r => r.value)
    .sort((a, b) => b.score - a.score);
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, isFinite(v) ? v : 0.5));
}
