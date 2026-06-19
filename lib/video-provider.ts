/**
 * Global video model router — Seedance via fal.ai by default.
 * Luma is only used when explicitly selected (FORCE_LUMA or scene.provider=luma).
 */

export const FORCE_SEEDANCE = true;
export const FORCE_LUMA = false;

export type VideoProvider = "seedance-fal" | "luma-fal";

export const DEFAULT_VIDEO_MODEL: VideoProvider = "seedance-fal";

export function getVideoProvider(scene?: { provider?: string } | unknown): VideoProvider {
  if (FORCE_LUMA) return "luma-fal";
  if (FORCE_SEEDANCE) return "seedance-fal";

  const explicit = scene && typeof scene === "object" && "provider" in scene
    ? String((scene as { provider?: string }).provider ?? "")
    : "";

  if (explicit === "luma" || explicit === "luma-fal") return "luma-fal";
  return DEFAULT_VIDEO_MODEL;
}

export function isLumaDefault(): boolean {
  return getVideoProvider() === "luma-fal";
}

export function isElevenLabsSeedance(): boolean {
  return getVideoProvider() === "seedance-fal";
}

export function isSeedanceDefault(): boolean {
  return getVideoProvider() === "seedance-fal";
}

/** @deprecated Kling disabled */
export function isKlingEnabled(): boolean {
  return false;
}

/** @deprecated smart_motion disabled */
export function isSmartMotionEnabled(): boolean {
  return false;
}