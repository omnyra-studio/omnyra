/**
 * Realism Engine — canonical prompt builders for hyper-real generation.
 *
 * Three injections that eliminate AI look:
 *   1. Hard realism prefix (every Runway + Flux prompt)
 *   2. Verbatim identity block (built ONCE per video, identical in every scene)
 *   3. Lived-in environment imperfections (per-scene, supplied by storyboard planner)
 *
 * Build identity once with buildIdentityBlock(), pass the result to buildFluxPrompt()
 * and buildRunwayPrompt() for every scene.  Never regenerate per scene.
 */

export const REALISM_PREFIX =
  "Ultra realistic cinematic video, no AI look, no morphing, no broken anatomy, " +
  "no texture flickering, natural body physics, realistic facial expressions, " +
  "premium influencer aesthetic, handheld camera, natural imperfect human motion, " +
  "soft depth of field";

export const REALISM_IMAGE_PREFIX =
  "Ultra realistic photo, no AI look, no plastic skin, no airbrushing, " +
  "realistic skin texture with visible pores and subtle imperfections, " +
  "natural asymmetry, authentic candid moment, handheld camera framing, " +
  "natural lighting";

export const NEGATIVE_BLOCK =
  "cartoon, 3d render, CGI, illustration, plastic skin, airbrushed, " +
  "symmetrical perfection, uncanny valley, extra fingers, deformed hands, " +
  "broken anatomy, morphing, texture flicker, watermark, text";

// Camera vocabulary for Runway — rotate through these, never repeat "smooth" or "perfect"
export const CAMERA_VOCABULARY = [
  "slow handheld push-in",
  "subtle handheld sway",
  "orbiting handheld move",
  "locked-off shot with natural micro-movement",
] as const;

export type CameraMove = typeof CAMERA_VOCABULARY[number];

export interface CharacterNoteInput {
  face?:     string;
  skin?:     string;
  eyes?:     string;
  hair?:     string;
  makeup?:   string;
  wardrobe?: string;
  jewelry?:  string;
  body?:     string;
}

/**
 * Build a byte-identical identity string for every scene of a video.
 * Call ONCE per video. Pass the result down — never call per scene.
 */
export function buildIdentityBlock(notes: CharacterNoteInput[]): string {
  if (notes.length === 0) return '';
  const parts = notes.flatMap(n => [
    n.face, n.skin, n.eyes, n.hair, n.makeup, n.wardrobe, n.jewelry, n.body,
  ]).filter((v): v is string => Boolean(v?.trim()));
  if (parts.length === 0) return '';
  return `Same person in every shot: ${parts.join(', ')}`;
}

/** Build identity from CharacterMemory core_prompt — for compatibility with existing char memory system */
export function buildIdentityFromMemory(corePrompt: string, visualSignature?: string): string {
  const parts = [corePrompt.trim(), visualSignature?.trim()].filter(Boolean);
  if (parts.length === 0) return '';
  return `Same person in every shot: ${parts.join(', ')}`;
}

export interface FluxPromptParams {
  identity:      string;   // from buildIdentityBlock / buildIdentityFromMemory
  action:        string;   // what the character is doing
  environment:   string;   // where they are
  imperfections?: string;  // 2-3 lived-in details from storyboard planner
  lighting:      string;
}

/**
 * Build a Flux still-image prompt.
 * Pass NEGATIVE_BLOCK via fal.ai negative_prompt — NOT inline here.
 */
export function buildFluxPrompt(params: FluxPromptParams): string {
  const { identity, action, environment, imperfections, lighting } = params;
  return [
    REALISM_IMAGE_PREFIX,
    identity,
    action,
    environment,
    imperfections,
    lighting,
    "no text, no written words",
  ].filter(Boolean).join(', ');
}

export interface RunwayPromptParams {
  motion:  string;   // physical action — what moves and how
  emotion: string;   // VISIBLE human behavior, not a label: "smiling with disbelief"
  camera:  string;   // from CAMERA_VOCABULARY
}

/**
 * Build a Runway motion prompt.
 * Describes MOTION only — never re-describes the image (Runway already has it).
 * Short, physical, specific. Never "smooth", never "perfect".
 */
export function buildRunwayPrompt(params: RunwayPromptParams): string {
  const { motion, emotion, camera } = params;
  return [REALISM_PREFIX, motion, emotion, camera]
    .filter(Boolean)
    .join('. ')
    .slice(0, 512);
}

/** Rotate camera vocabulary by scene index — ensures variety across clips */
export function pickCamera(sceneIndex: number): CameraMove {
  return CAMERA_VOCABULARY[sceneIndex % CAMERA_VOCABULARY.length];
}
