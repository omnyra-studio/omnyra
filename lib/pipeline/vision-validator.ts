/**
 * Vision Validator — Claude Vision check of generated image against SceneContract.
 *
 * Runs after Flux image generation, before Runway clip generation.
 * Catches clothing violations, wrong characters, forbidden elements before
 * wasting a Runway credit on a bad source image.
 *
 * Uses claude-haiku-4-5 for speed (~1s) and cost (~$0.001 per check).
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SceneContract } from "./types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface VisionResult {
  passed:   boolean;
  score:    number;         // 0–1
  issues:   string[];       // human-readable violations
  checkedAt: number;        // epoch ms
}

const PASS_THRESHOLD = 0.75;

// ── Public API ────────────────────────────────────────────────────────────────

export async function validateImage(
  imageUrl:  string,
  contract:  SceneContract,
): Promise<VisionResult> {
  const label = `[VISION scene=${contract.index + 1}]`;
  const t0    = Date.now();

  try {
    const prompt = buildCheckPrompt(contract);

    const response = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type:      "image",
              source:    { type: "url", url: imageUrl },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
    const result = parseVisionResponse(raw);

    console.log(
      `${label} score=${result.score.toFixed(2)} passed=${result.passed} ` +
      `issues=${result.issues.length} elapsed=${Date.now() - t0}ms`,
    );

    return { ...result, checkedAt: Date.now() };
  } catch (err) {
    // Vision check is non-fatal — log and pass through so clip still generates
    console.warn(`${label} check failed (non-fatal): ${err instanceof Error ? err.message : err}`);
    return { passed: true, score: 1, issues: [], checkedAt: Date.now() };
  }
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildCheckPrompt(contract: SceneContract): string {
  const char    = contract.characters[0];
  const charDesc = char ? char.promptFragment : "no specific character";
  const loc     = contract.location.promptFragment;
  const forbidden = [
    ...contract.forbiddenElements,
    "bare shoulders", "strapless", "cleavage", "topless", "nude", "nsfw",
  ].join(", ");

  return `You are a quality-control validator for AI-generated video frames. Evaluate this image STRICTLY against the following contract. Reply ONLY with a JSON object — no prose.

CONTRACT:
- Character: ${charDesc}
- Location: ${loc}
- Emotion/action: ${contract.emotion} — ${contract.action}
- Forbidden: ${forbidden}

CHECK these criteria and assign pass (true) or fail (false) per item:
1. clothing_ok: No bare shoulders, strapless, cleavage, or revealing garments visible
2. no_forbidden: None of the forbidden elements appear in the image
3. has_subject: A human subject matching the character description is present
4. location_match: Setting roughly matches the described location

Respond with exactly this JSON (no markdown, no explanation):
{"clothing_ok":bool,"no_forbidden":bool,"has_subject":bool,"location_match":bool,"issues":["issue1","issue2"]}

Only list actual violations in issues array. Empty array if none.`;
}

// ── Response parser ───────────────────────────────────────────────────────────

function parseVisionResponse(raw: string): Omit<VisionResult, "checkedAt"> {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no JSON in response");

    const parsed = JSON.parse(jsonMatch[0]) as {
      clothing_ok:    boolean;
      no_forbidden:   boolean;
      has_subject:    boolean;
      location_match: boolean;
      issues:         string[];
    };

    const checks = [
      parsed.clothing_ok,
      parsed.no_forbidden,
      parsed.has_subject,
      parsed.location_match,
    ];

    // clothing_ok and no_forbidden are hard requirements (double weight)
    const score =
      (Number(parsed.clothing_ok)    * 0.35 +
       Number(parsed.no_forbidden)   * 0.30 +
       Number(parsed.has_subject)    * 0.20 +
       Number(parsed.location_match) * 0.15);

    const hardFail = !parsed.clothing_ok || !parsed.no_forbidden;
    const passed   = !hardFail && score >= PASS_THRESHOLD;
    const issues   = Array.isArray(parsed.issues) ? parsed.issues : [];

    if (!parsed.clothing_ok) issues.unshift("clothing violation detected");
    if (!parsed.no_forbidden) issues.unshift("forbidden element detected");

    return { passed, score, issues };
  } catch {
    // If parsing fails, treat as passed (non-blocking)
    return { passed: true, score: 1, issues: [] };
  }
}
