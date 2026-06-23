import type { ContinuitySnapshot } from "@omnyra/continuity-engine";
import { DRIFT_THRESHOLDS } from "@omnyra/continuity-engine";

/**
 * Injects the first-frame lock language into any prompt string.
 * Called after the base prompt is built — adds the 2s freeze instruction.
 *
 * For Runway: Motion Brush + reference frame language.
 * For Kling: "Continue from last frame:" prefix.
 */
export function injectFirstFrameLock(
  prompt:      string,
  snapshot:    ContinuitySnapshot,
  provider:    "runway" | "kling" = "kling",
): string {
  if (snapshot.sceneIndex === 0 || !snapshot.firstFrame.imageUrl) return prompt;

  const char     = Object.values(snapshot.characters)[0];
  const poseLock = char?.pose ?? "previous pose";
  const freeze   = DRIFT_THRESHOLDS.FIRST_FRAME_FREEZE_SECS;

  if (provider === "runway") {
    const injection =
      `Motion Brush: first ${freeze}s — match reference frame exactly, ` +
      `pose=${poseLock}, camera=${snapshot.camera.lens} ${snapshot.camera.type}. ` +
      `After ${freeze}s: resume ${snapshot.camera.movement}. `;
    return injection + prompt;
  }

  // Kling
  const injection =
    `Continue from last frame: ${poseLock} maintained for first ${freeze} seconds. ` +
    `${snapshot.camera.movement} begins after ${freeze}s. `;
  return injection + prompt;
}
