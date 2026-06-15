/**
 * lib/prompt-optimizer.ts — Prompt optimization for Omnyra.studio
 *
 * Automatically trims, cleans, and speed-optimizes AI video/image prompts:
 * - Enforces Ghost Test (no emotion words — physical behavior only)
 * - Injects historical context when era is detected (via prompt-enhancer)
 * - Trims prompts to ideal length for fast inference (<800 chars for video)
 * - Appends cinematic quality suffixes consistently
 * - Optimizes prompts for Kling / Fal / Flux / ElevenLabs
 */

import { detectHistoricalEra, applyHistoricalContext } from "@/lib/prompt-enhancer";
import { detectNiche, applyNicheContext }            from "@/lib/niche-enhancer";

// ── Ghost Test enforcement ────────────────────────────────────────────────────

// Emotion words that violate the Ghost Test — replace with behavioral descriptions
const EMOTION_WORD_PATTERNS: [RegExp, string][] = [
  [/\b(furious|enraged|irate|livid)\b/gi,          "jaw clenched, shoulders tight"],
  [/\b(heartbroken|devastated|crushed)\b/gi,       "still, staring at the floor"],
  [/\b(relieved|peaceful|at peace)\b/gi,           "shoulders dropping, slow exhale"],
  [/\b(excited|thrilled|overjoyed|ecstatic)\b/gi,  "leaning forward, moving quickly"],
  [/\b(guilty|ashamed|remorseful)\b/gi,            "eyes down, shoulders hunched"],
  [/\b(anxious|nervous|panicked)\b/gi,             "hand on surface, rapid breath"],
  [/\b(sad|unhappy|depressed|miserable)\b/gi,      "quiet, minimal movement"],
  [/\b(happy|joyful|content|elated)\b/gi,          "open posture, easy movement"],
  [/\b(angry|upset|frustrated)\b/gi,               "stillness before movement"],
  [/\b(shocked|stunned|surprised)\b/gi,            "stopped mid-motion, wide eyes"],
  [/\b(in love|loving|romantic)\b/gi,              "leaning in, sustained eye contact"],
  [/\b(lonely|isolated|alone)\b/gi,                "hands folded, looking toward window"],
  [/\b(confident|empowered|strong)\b/gi,           "upright posture, direct gaze"],
  [/\bfeel(s|ing)?\s+(good|great|amazing|wonderful)\b/gi, "moves with ease, unhurried pace"],
];

/**
 * Applies Ghost Test to a prompt — replaces named emotion words with
 * their observable behavioral equivalents.
 */
export function applyGhostTest(prompt: string): string {
  let result = prompt;
  for (const [pattern, replacement] of EMOTION_WORD_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Returns true if the prompt passes the Ghost Test (no remaining emotion words).
 */
export function passesGhostTest(prompt: string): boolean {
  return EMOTION_WORD_PATTERNS.every(([pattern]) => !pattern.test(prompt));
}

// ── Speed optimization ────────────────────────────────────────────────────────

export type PromptTarget = "video_cinematic" | "video_avatar" | "image_flux" | "voiceover";

export interface OptimizedPrompt {
  prompt:           string;
  originalLength:   number;
  optimizedLength:  number;
  ghostTestPassed:  boolean;
  trimmed:          boolean;
}

const MAX_PROMPT_CHARS: Record<PromptTarget, number> = {
  video_cinematic: 800,   // Kling performs best under ~800 chars
  video_avatar:    600,   // Hedra is sensitive to prompt length
  image_flux:      1200,  // Flux handles longer prompts well
  voiceover:       2000,  // ElevenLabs — full script length OK
};

const SPEED_SUFFIX: Record<PromptTarget, string> = {
  video_cinematic: ", cinematic photorealistic, consistent character, medium motion, natural lighting, high quality",
  video_avatar:    ", close-up portrait, consistent face, natural lighting, clean background",
  image_flux:      ", photorealistic, filmic, high detail, natural skin tones, no artifacts",
  voiceover:       "",
};

/**
 * Optimizes a prompt for maximum inference speed while maintaining quality:
 * 1. Applies Ghost Test (behavioral descriptions only)
 * 2. Trims to target length for the provider
 * 3. Appends quality/speed suffix
 */
export function optimizePrompt(
  raw:    string,
  target: PromptTarget,
): OptimizedPrompt {
  const originalLength = raw.length;

  // Step 1: Ghost Test
  const ghostTested = applyGhostTest(raw.trim());
  const ghostTestPassed = passesGhostTest(ghostTested);

  // Step 2: Trim to max length (trim at word boundary)
  const maxChars = MAX_PROMPT_CHARS[target];
  let trimmed = ghostTested;
  let wasTrimmed = false;

  if (ghostTested.length > maxChars) {
    trimmed = ghostTested.slice(0, maxChars).replace(/\s+\S*$/, "");
    wasTrimmed = true;
  }

  // Step 3: Append speed/quality suffix
  const suffix = SPEED_SUFFIX[target];
  // Don't double-append if suffix already present
  const finalPrompt = suffix && !trimmed.toLowerCase().includes("photorealistic")
    ? `${trimmed}${suffix}`
    : trimmed;

  return {
    prompt:          finalPrompt,
    originalLength,
    optimizedLength: finalPrompt.length,
    ghostTestPassed,
    trimmed:         wasTrimmed,
  };
}

/**
 * Builds a complete, speed-optimized video prompt for Kling/Fal.
 * Enforces Ghost Test + cinematic quality markers + motion guidance.
 */
export function buildVideoPrompt(
  visualDescription: string,
  options?: {
    characterRef?: string;
    brandStyle?:   string;
    isAvatar?:     boolean;
    duration?:     number;
  },
): string {
  const { characterRef, brandStyle, isAvatar = false, duration = 30 } = options ?? {};

  // Historical context — auto-detect era and inject period-accurate visual details.
  // Skipped for avatar shots (character portraits, not scene compositions).
  let baseDescription = visualDescription.trim();
  if (!isAvatar) {
    const era = detectHistoricalEra(baseDescription);
    if (era) {
      baseDescription = applyHistoricalContext(baseDescription, era);
      console.info(`[PROMPT_OPTIMIZER] historical_era="${era.eraLabel}" injection_applied=true`);
    } else {
      const niche = detectNiche(baseDescription);
      if (niche) {
        baseDescription = applyNicheContext(baseDescription, niche);
        console.info(`[PROMPT_OPTIMIZER] niche="${niche.nicheLabel}" injection_applied=true`);
      }
    }
  }

  const parts: string[] = [baseDescription];

  if (characterRef) {
    parts.push(`Character: ${characterRef}`);
  }

  if (brandStyle) {
    parts.push(brandStyle);
  }

  // Duration + motion hints for speed optimization
  parts.push(`${duration}s video`);
  parts.push("medium motion complexity");
  parts.push(isAvatar ? "natural lip sync, consistent face" : "smooth camera movement");

  const combined = parts.join(", ");
  const target: PromptTarget = isAvatar ? "video_avatar" : "video_cinematic";

  return optimizePrompt(combined, target).prompt;
}

/**
 * Builds a scene image prompt with Ghost Test + Flux optimization.
 * Ensures character description is embedded for consistency.
 */
export function buildImagePrompt(
  sceneDescription: string,
  characterRef?:    string,
  brandStyle?:      string,
): string {
  const parts = [sceneDescription.trim()];
  if (characterRef) parts.push(`Same character: ${characterRef}`);
  if (brandStyle) parts.push(brandStyle);

  return optimizePrompt(parts.join(", "), "image_flux").prompt;
}
