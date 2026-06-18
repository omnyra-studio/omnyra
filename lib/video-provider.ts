/**
 * Global video model router — Seedance via ElevenLabs ONLY.
 * Kling, Runway, and smart_motion are fully disabled.
 */

// FORCE SEEDANCE - DISABLE KLING COMPLETELY
export const FORCE_SEEDANCE = true;

export type VideoProvider = "seedance-elevenlabs";

export const DEFAULT_VIDEO_MODEL: VideoProvider = "seedance-elevenlabs";

/** Hard override — always Seedance. No Kling, no smart_motion. */
export function getVideoProvider(_scene?: unknown): VideoProvider {
  if (FORCE_SEEDANCE) return "seedance-elevenlabs";
  return DEFAULT_VIDEO_MODEL;
}

export function isElevenLabsSeedance(): boolean {
  return FORCE_SEEDANCE;
}

export function isSeedanceDefault(): boolean {
  return true;
}

/** @deprecated Kling disabled */
export function isKlingEnabled(): boolean {
  return false;
}

/** @deprecated smart_motion disabled */
export function isSmartMotionEnabled(): boolean {
  return false;
}