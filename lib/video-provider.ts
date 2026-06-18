/**
 * Global video model router — Luma Ray 2 via fal.ai ONLY.
 * Seedance, Kling, Runway, and smart_motion are fully disabled.
 */

export const FORCE_LUMA = true;

/** @deprecated Use FORCE_LUMA — kept so existing imports compile. */
export const FORCE_SEEDANCE = true;

export type VideoProvider = "luma-fal";

export const DEFAULT_VIDEO_MODEL: VideoProvider = "luma-fal";

/** Hard override — always Luma Ray 2 via fal.ai. */
export function getVideoProvider(_scene?: unknown): VideoProvider {
  return "luma-fal";
}

export function isLumaDefault(): boolean {
  return true;
}

/** @deprecated Use isLumaDefault() */
export function isElevenLabsSeedance(): boolean {
  return false;
}

/** @deprecated Use isLumaDefault() */
export function isSeedanceDefault(): boolean {
  return false;
}

/** @deprecated Kling disabled */
export function isKlingEnabled(): boolean {
  return false;
}

/** @deprecated smart_motion disabled */
export function isSmartMotionEnabled(): boolean {
  return false;
}