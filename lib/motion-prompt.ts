/**
 * Central motion + ethnicity prompt layering for Seedance / cinematic handlers.
 */

export const MOTION_KEYWORDS =
  "smooth camera movement, dynamic action, fluid motion, walking naturally, parallax effect";

export const BASE_IMAGE_FRAME_SUFFIX =
  "[high quality starting frame, clear subject]";

export const STRONG_MOTION_SUFFIX =
  "dynamic camera movement, smooth motion, people walking naturally, fluid animation";

export const HIGH_MOTION_STRENGTH = 0.72;

export function motionStrengthToCfgScale(strength: number = HIGH_MOTION_STRENGTH): number {
  const clamped = Math.max(0.35, Math.min(0.75, strength));
  return parseFloat((1.0 - clamped).toFixed(2));
}

const MOTION_KEYWORD_RE =
  /\b(smooth camera movement|dynamic action|fluid motion|parallax effect|dynamic camera movement|people walking naturally|fluid animation)\b/i;

export function hasMotionKeywords(prompt: string): boolean {
  return MOTION_KEYWORD_RE.test(prompt);
}

export function buildBaseImagePrompt(userPrompt: string): string {
  const trimmed = userPrompt.trim();
  if (trimmed.includes(BASE_IMAGE_FRAME_SUFFIX)) return trimmed;
  return `${trimmed} ${BASE_IMAGE_FRAME_SUFFIX}`;
}

export function buildMotionPrompt(userPrompt: string): string {
  const base = buildBaseImagePrompt(userPrompt);
  if (hasMotionKeywords(base)) return base;
  return `${base}, ${STRONG_MOTION_SUFFIX}, ${MOTION_KEYWORDS}`;
}

export function applyMotionKeywords(prompt: string): string {
  const trimmed = prompt.trim().replace(/[.,\s]+$/, "");
  if (hasMotionKeywords(trimmed)) return trimmed;
  return `${trimmed}, ${MOTION_KEYWORDS}`;
}

export const ENHANCED_CINEMATIC_RE =
  /\[ETHNICITY:|\[ETHNICITY LOCK:|\[ETHNICITY DEFAULT:|\[DEFAULT: All people are Caucasian|\[MOTION:|\[MANDATORY MOTION:|\[MOTION REQUIREMENT:|\[CRITICAL: Strong motion|\[REQUIREMENTS: Strong dynamic motion/i;

export function buildEnhancedCinematicPrompt(prompt: string): string {
  return buildSeedanceElevenLabsPrompt(prompt);
}

/** Final ElevenLabs Seedance prompt — ethnicity lock + mandatory motion block. */
export function buildSeedanceElevenLabsPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) return trimmed;
  if (ENHANCED_CINEMATIC_RE.test(trimmed)) return trimmed;
  return `[ETHNICITY: Caucasian woman with blonde hair.]
${trimmed}

[MANDATORY STRONG MOTION: Camera push-in, zoom, natural walking, dancing movement, fluid body animation, dynamic energy. Make it alive and emotional.]`;
}