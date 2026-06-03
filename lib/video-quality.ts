import type { ShotPacket } from "@/lib/types/shot";
import type { ContinuityBibles } from "@/lib/visual-continuity";

// Camera-first motion directives — placed at FRONT of prompt for maximum model weight
const CAMERA_DIRECTIVES: Record<string, string> = {
  static:          "Locked-off static shot of",
  slow_push_in:    "Slow cinematic push-in toward",
  dolly_in:        "Smooth forward dolly-in toward",
  handheld_drift:  "Subtle handheld organic drift around",
  crane_up:        "Rising crane-up reveal above",
  whip_pan:        "Fast energetic whip-pan to",
  orbital_slow:    "Slow sweeping 180-degree orbit around",
};

const FRAMING_DESCRIPTORS: Record<string, string> = {
  extreme_closeup: "extreme close-up",
  closeup:         "close-up",
  medium_closeup:  "medium close-up",
  medium:          "medium shot",
  wide:            "wide shot",
};

// Motion hints injected when no motion verb exists — prevents slideshow/static outputs
const SCENE_MOTION_HINTS: Record<string, string> = {
  avatar:       "subtle breathing and natural micro-movements",
  broll:        "gentle organic environmental motion",
  text_overlay: "slow cinematic parallax",
  transition:   "smooth flowing movement",
  default:      "natural fluid motion",
};

const STYLE_SUFFIX = "cinematic, ultra-realistic, 9:16 portrait, professional cinematography";

const MOTION_VERB_RE = /\b(walk|run|mov|turn|sway|breath|gestur|spin|danc|flow|driv|fall|rise|lift|reach|step|look|lean|pull|push|open|close)\w*\b/i;

export function hasMotionVerb(prompt: string): boolean {
  return MOTION_VERB_RE.test(prompt);
}

function buildCharacterLock(c: ContinuityBibles["character"]): string {
  if (!c) return "";
  // Use raw description if present; otherwise build from structured fields
  if (c.raw) return c.raw;
  return [c.gender, c.ageRange, c.hair, ...c.clothing.slice(0, 2), ...c.accessories.slice(0, 1)]
    .filter(Boolean)
    .join(", ");
}

/**
 * Builds a structured Kling prompt optimised for cinematic motion and identity consistency.
 * Structure: [Camera direction] [character lock?] [scene description], [motion hint?] [framing], [style]
 * Camera direction goes FIRST — highest model weight.
 * Character lock PRECEDES scene description — prevents identity drift.
 */
export function compileKlingPrompt(shot: ShotPacket, bibles?: ContinuityBibles | null): string {
  const camera    = CAMERA_DIRECTIVES[shot.camera_behavior] ?? "Cinematic shot of";
  const framing   = FRAMING_DESCRIPTORS[shot.framing] ?? "medium shot";
  const baseScene = shot.visual_prompt.trim().replace(/[.,\s]+$/, "");

  const charLock = bibles?.character ? buildCharacterLock(bibles.character) : "";
  const motionHint = hasMotionVerb(baseScene)
    ? ""
    : SCENE_MOTION_HINTS[shot.content_type] ?? SCENE_MOTION_HINTS.default;

  const segments: string[] = [];

  // 1. Camera + character identity (if present)
  if (charLock) {
    segments.push(`${camera} ${charLock},`);
  } else {
    segments.push(`${camera}`);
  }

  // 2. Scene description
  segments.push(`${baseScene},`);

  // 3. Motion hint (anti-slideshow)
  if (motionHint) segments.push(`${motionHint},`);

  // 4. Framing + style
  segments.push(`${framing}, ${STYLE_SUFFIX}`);

  return segments.join(" ");
}
