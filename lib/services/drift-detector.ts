/**
 * Drift Detector — compares generated frames against the original reference image
 * to catch character identity drift before it compounds across scenes.
 *
 * Uses Claude Haiku Vision (scoreImagePair) — ~500ms per check.
 * Designed to run within the 1200ms stagger between sequential Kling calls.
 *
 * Drift levels:
 *   score ≥ 0.85  → OK
 *   0.72 – 0.85   → WARNING  — tighten constraints next scene
 *   < 0.72        → CRITICAL — force stricter reference weight + reduce motion
 */

import { scoreImagePair, CONSISTENCY_RETRY_THRESHOLD } from "@/lib/memory/consistency-scorer";

export type DriftLevel = 'ok' | 'warning' | 'critical';

export interface DriftResult {
  score:         number;   // 0.0–1.0
  level:         DriftLevel;
  sceneIndex:    number;
  referenceUrl:  string;
  frameUrl:      string;
  adjustment:    DriftAdjustment;
}

export interface DriftAdjustment {
  reduceMotionStrength: boolean;
  newMotionStrength:    number;
  prefixOverride:       string | null;  // prepend to next scene's prompt
  enforcePoseLock:      boolean;
}

const OK_THRESHOLD       = 0.85;
// CONSISTENCY_RETRY_THRESHOLD = 0.72 (critical)

function buildAdjustment(score: number, currentMotionStrength: number): DriftAdjustment {
  if (score >= OK_THRESHOLD) {
    return {
      reduceMotionStrength: false,
      newMotionStrength:    currentMotionStrength,
      prefixOverride:       null,
      enforcePoseLock:      false,
    };
  }

  if (score >= CONSISTENCY_RETRY_THRESHOLD) {
    // Warning — tighten slightly
    return {
      reduceMotionStrength: true,
      newMotionStrength:    Math.max(0.5, currentMotionStrength - 0.10),
      prefixOverride:
        "CHARACTER LOCK: Same face, same hair, same clothing as previous scene. " +
        "Identity must not change. Reduce all motion by 30%. " +
        "First 2 seconds: absolute static freeze from last frame.\n",
      enforcePoseLock: false,
    };
  }

  // Critical — maximum constraint tightening
  return {
    reduceMotionStrength: true,
    newMotionStrength:    0.45,
    prefixOverride:
      "CRITICAL IDENTITY LOCK: This is a RE-RENDER with drift correction. " +
      "Face must be IDENTICAL to reference image — same bone structure, same skin, same hair. " +
      "No motion except the absolute minimum needed. " +
      "Begin from exact freeze of previous frame. No camera movement.\n",
    enforcePoseLock: true,
  };
}

/**
 * Check frame consistency between a generated last-frame and the original reference.
 * Non-blocking if Claude Vision fails — returns null on any error.
 */
export async function detectFrameDrift(
  lastFrameUrl:      string,
  referenceImageUrl: string,
  sceneIndex:        number,
  currentMotionStrength: number,
): Promise<DriftResult | null> {
  if (!lastFrameUrl || !referenceImageUrl) return null;
  if (!lastFrameUrl.startsWith("https://") || !referenceImageUrl.startsWith("https://")) return null;

  try {
    const score = await scoreImagePair(lastFrameUrl, referenceImageUrl);
    if (score === null) return null;

    const level: DriftLevel =
      score >= OK_THRESHOLD                  ? 'ok'       :
      score >= CONSISTENCY_RETRY_THRESHOLD   ? 'warning'  : 'critical';

    const result: DriftResult = {
      score,
      level,
      sceneIndex,
      referenceUrl: referenceImageUrl,
      frameUrl:     lastFrameUrl,
      adjustment:   buildAdjustment(score, currentMotionStrength),
    };

    console.log(`[DRIFT] scene=${sceneIndex + 1} score=${score.toFixed(2)} level=${level} motion=${result.adjustment.newMotionStrength.toFixed(2)}`);
    return result;
  } catch (err) {
    console.warn(`[DRIFT] detection failed (non-fatal):`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Build a retry prompt for a scene that failed or drifted critically.
 * Prepends strict re-render instructions to the original prompt.
 */
export function buildRetryPrompt(originalPrompt: string, attempt: number): string {
  const RETRY_PREFIX =
    `RETRY ${attempt}: Strict re-render. ` +
    "Reduce all motion by 50%. Stronger character identity lock. " +
    "Begin from exact static freeze. Face must match reference exactly.\n";
  return (RETRY_PREFIX + originalPrompt).slice(0, 500);
}
