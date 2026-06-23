import type { ContinuitySnapshot } from "@omnyra/continuity-engine";
import { buildPromptFromSnapshot, DRIFT_THRESHOLDS } from "@omnyra/continuity-engine";

export interface RunwayPromptOptions {
  maxLength?: number;   // default 1000 (Runway supports longer prompts)
}

/**
 * Build Runway Gen-4 video prompt from a ContinuitySnapshot.
 * Runway-specific continuity language injected automatically.
 */
export function buildRunwayPrompt(
  snapshot: ContinuitySnapshot,
  options:  RunwayPromptOptions = {},
): string {
  const max    = options.maxLength ?? 1000;
  const base   = buildPromptFromSnapshot(snapshot);

  // Runway Gen-4 continuity language
  const continuityNote = snapshot.sceneIndex > 0
    ? `Motion Brush: maintain character identity. Continue temporal flow from reference image. ` +
      `No scene cut. First ${DRIFT_THRESHOLDS.FIRST_FRAME_FREEZE_SECS}s: match reference frame exactly. `
    : "";

  // Runway responds better to explicit style injection
  const brand    = snapshot.brand.characters[0];
  const styleNote = brand
    ? `${brand.styleProfile.lighting}. ${brand.styleProfile.colorGrade}. ${brand.styleProfile.cinematicStyle}. `
    : "Roger Deakins golden hour. Teal-orange cinematic grade. ";

  return (continuityNote + styleNote + base).slice(0, max);
}

export interface RunwayJobParams {
  promptImage:   string;    // reference frame URL
  promptText:    string;    // video prompt
  model:         "gen4_turbo";
  duration:      5 | 10;
  ratio:         "1280:720" | "720:1280" | "1104:832" | "832:1104";
  watermark?:    false;
}

export function buildRunwayJobParams(
  snapshot:    ContinuitySnapshot,
  imageUrl:    string,
  aspectRatio: string = "9:16",
  durationSec: 5 | 10 = 10,
): RunwayJobParams {
  const ratioMap: Record<string, RunwayJobParams["ratio"]> = {
    "9:16": "720:1280",
    "16:9": "1280:720",
    "4:3":  "1104:832",
    "3:4":  "832:1104",
  };

  return {
    promptImage: imageUrl,
    promptText:  buildRunwayPrompt(snapshot),
    model:       "gen4_turbo",
    duration:    durationSec,
    ratio:       ratioMap[aspectRatio] ?? "720:1280",
    watermark:   false,
  };
}
