/**
 * Video provider constants — Kling 2.6 Pro only.
 * Seedance and Luma are fully removed.
 */

export const FORCE_SEEDANCE = false;
export const FORCE_LUMA     = false;

export type VideoProvider = "kling";

export const DEFAULT_VIDEO_MODEL: VideoProvider = "kling";

export function getVideoProvider(_scene?: unknown): VideoProvider {
  return "kling";
}

export function isLumaDefault():       boolean { return false; }
export function isElevenLabsSeedance(): boolean { return false; }
export function isSeedanceDefault():   boolean { return false; }
export function isKlingEnabled():      boolean { return true; }
export function isSmartMotionEnabled(): boolean { return false; }
