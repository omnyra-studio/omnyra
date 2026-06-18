// Scene router for the parallel orchestration engine.
//
// Routing precedence:
//   1. shots.render_assignment field ('avatar' | 'fal') — set at shot-plan creation
//   2. Multi-character scenes always → Seedance
//   3. Classifier on combined visual_prompt + audio_intent
//   4. No character image → Seedance fallback

import { routeModel }    from "@/lib/avatar/model-router";
import { classifyScene } from "@/lib/avatar/scene-classifier";
import { LUMA_VIDEO_MODEL } from "@/lib/services/elevenlabs";
import { falLumaGenerate } from "@/lib/providers/luma";
import { FORCE_LUMA, getVideoProvider } from "@/lib/video-provider";
import { isMultiCharacterScene } from "./multi-character-handler";

/** Luma Ray 2 via fal.ai — sole cinematic video provider. */
function pickLumaModel(speedMode: string, preferI2V: boolean): string {
  void speedMode;
  void preferI2V;
  return LUMA_VIDEO_MODEL;
}

/** Generate a Luma Ray 2 clip via fal.ai. TTS voiceover is separate (ElevenLabs). */
export async function generateSeedanceVideo(
  fullPrompt: string,
  options: { duration?: number; imageUrl?: string | null } = {},
): Promise<string> {
  if (FORCE_LUMA) {
    console.log("[LUMA] scene router — 5s 720p i2v-preferred");
  }
  void getVideoProvider();
  const result = await falLumaGenerate({
    prompt:   fullPrompt,
    imageUrl: options.imageUrl,
    duration: options.duration ?? 5,
    resolution: "720p",
    aspectRatio: "9:16",
  });
  return result.videoUrl;
}

export type Provider = "hedra" | "seedance";

export interface ShotRoute {
  shotId:              string;
  shotNumber:          number;
  provider:            Provider;
  seedanceModelId?:    string;
  maxDurationSecs?:    number;
  motionStrength?:     number;
  preferI2V?:          boolean;
  isStylized?:         boolean;
  sourceImageProvider?: "getimg";
  reason:              string;
}

export interface RoutableSot {
  id:                string;
  shot_number:       number;
  render_assignment: string | null;
  visual_prompt:     string;
  audio_intent?:     string | null;
  fal_model?:        string | null;
  content_type?:     string | null;
}

export interface RouteOptions {
  characterHasImage: boolean;
  draftMode?:        boolean;
  speedMode?:        string;
  isMultiCharacter?: boolean;
}

export function routeShot(shot: RoutableSot, opts: RouteOptions): ShotRoute {
  const { characterHasImage, speedMode = 'balanced' } = opts;

  const label = `shot=${shot.id} num=${shot.shot_number}`;

  const multiChar = opts.isMultiCharacter ?? isMultiCharacterScene(shot.visual_prompt);
  const combinedText = `${shot.visual_prompt} ${shot.audio_intent ?? ""}`.toLowerCase();
  const stylized     = isStylizedCharacter(combinedText);

  if (multiChar) {
    const motionStrength = getMotionStrength(speedMode, combinedText, stylized);
    const r: ShotRoute = {
      shotId: shot.id, shotNumber: shot.shot_number, provider: "seedance",
      seedanceModelId: pickLumaModel(speedMode, false), motionStrength, isStylized: stylized,
      reason: "multi-character → seedance",
    };
    console.info(`[ROUTER] → SEEDANCE ${label} reason=${r.reason} motion=${motionStrength} stylized=${stylized}`);
    return r;
  }

  if (shot.render_assignment === "avatar") {
    if (!characterHasImage) {
      const motionStrength = getMotionStrength(speedMode, combinedText, stylized);
      const r: ShotRoute = {
        shotId: shot.id, shotNumber: shot.shot_number, provider: "seedance",
        seedanceModelId: pickLumaModel(speedMode, false), motionStrength, isStylized: stylized,
        reason: "render_assignment=avatar but no character image → seedance fallback",
      };
      console.info(`[ROUTER] → SEEDANCE ${label} reason=${r.reason} motion=${motionStrength}`);
      return r;
    }
    const maxDurationSecs = _hedraMaxSecs(speedMode);
    const r: ShotRoute = { shotId: shot.id, shotNumber: shot.shot_number, provider: "hedra", maxDurationSecs, reason: "render_assignment=avatar" };
    console.info(`[ROUTER] → HEDRA ${label} maxSecs=${maxDurationSecs} reason=${r.reason}`);
    return r;
  }

  if (shot.render_assignment === "fal") {
    const motionStrength = getMotionStrength(speedMode, combinedText, stylized);
    const preferI2V = stylized && characterHasImage && speedMode !== 'ultra-draft';
    const r: ShotRoute = {
      shotId: shot.id, shotNumber: shot.shot_number, provider: "seedance",
      seedanceModelId: pickLumaModel(speedMode, preferI2V), motionStrength, preferI2V, isStylized: stylized,
      reason: "render_assignment=fal → seedance",
    };
    console.info(`[ROUTER] → SEEDANCE ${label} reason=${r.reason} motion=${motionStrength} i2v=${preferI2V} stylized=${stylized}`);
    return r;
  }

  const isTalkingScene = /\b(speaking|talking|says|narration|looking at camera|direct to camera|addresses camera|lip.?sync|voiceover|presenter|host|direct address)\b/.test(combinedText);

  if (isTalkingScene && characterHasImage && speedMode !== 'ultra-draft') {
    const maxDurationSecs = _hedraMaxSecs(speedMode);
    const r: ShotRoute = { shotId: shot.id, shotNumber: shot.shot_number, provider: "hedra", maxDurationSecs, reason: "talking-scene keyword match → hedra" };
    console.info(`[ROUTER] → HEDRA ${label} maxSecs=${maxDurationSecs} reason=${r.reason} text="${combinedText.slice(0, 60)}"`);
    return r;
  }

  const classification = classifyScene(combinedText);
  const routing        = routeModel(classification);

  if (routing.model === "hedra" && characterHasImage && speedMode !== 'ultra-draft') {
    const maxDurationSecs = _hedraMaxSecs(speedMode);
    const r: ShotRoute = { shotId: shot.id, shotNumber: shot.shot_number, provider: "hedra", maxDurationSecs, reason: `classifier: ${routing.reason}` };
    console.info(`[ROUTER] → HEDRA ${label} maxSecs=${maxDurationSecs} reason=${r.reason}`);
    return r;
  }

  const motionStrength = getMotionStrength(speedMode, combinedText, stylized);
  const preferI2V      = stylized && characterHasImage && speedMode !== 'ultra-draft';
  const provider = getVideoProvider();
  const r: ShotRoute = {
    shotId: shot.id, shotNumber: shot.shot_number, provider: "seedance",
    seedanceModelId: pickLumaModel(speedMode, preferI2V), motionStrength, preferI2V, isStylized: stylized,
    reason: `classifier: ${routing.reason} → ${provider}`,
  };
  console.info(`[ROUTER] → SEEDANCE ${label} model=${r.seedanceModelId} reason=${r.reason} motion=${motionStrength} i2v=${preferI2V} stylized=${stylized}`);
  return r;
}

function _hedraMaxSecs(speedMode: string): number {
  if (speedMode === 'ultra-draft') return 9;
  if (speedMode === 'draft')       return 12;
  if (speedMode === 'balanced')    return 25;
  return 30;
}

function isStylizedCharacter(t: string): boolean {
  return /\b(big bird|snuffleupagus|snuffy|muppet|puppet|sesame|cartoon|anime|pokemon|furry|creature|monster|dragon|fairy|elf|gnome|troll|goblin|unicorn|dinosaur|robot|alien|plush|stuffed animal|mascot|disney|pixar|dreamworks|animated character|3d animation|cgi character|princess peach|mario|luigi|bowser|zelda|kirby|pikachu|yoshi|wario|donkey kong|abraham lincoln|george washington|napoleon|historical cartoon|fictional character|storybook)\b/.test(t);
}

export interface SeedanceRoute {
  seedanceModelId:   string;
  useI2V:            boolean;
  motionStrength:    number;
  maxDurationSecs:   number;
  reason:            string;
}

export function getSeedanceRoute(options: {
  speedMode:          string;
  isAvatar?:          boolean;
  isAnimated?:        boolean;
  hasReferenceImage?: boolean;
}): SeedanceRoute {
  const { speedMode, isAvatar = false, isAnimated = false, hasReferenceImage = false } = options;

  if (speedMode === 'ultra-draft') {
    return {
      seedanceModelId:   LUMA_VIDEO_MODEL,
      useI2V:            false,
      motionStrength:    0.45,
      maxDurationSecs:   5,
      reason:            `routing:${speedMode}-standard`,
    };
  }

  if (isAvatar) {
    return {
      seedanceModelId:   LUMA_VIDEO_MODEL,
      useI2V:            true,
      motionStrength:    0.45,
      maxDurationSecs:   12,
      reason:            `routing:avatar-i2v`,
    };
  }

  if (isAnimated) {
    const boostedMotion = Math.max(0.68, 0.70);
    return {
      seedanceModelId:   LUMA_VIDEO_MODEL,
      useI2V:            hasReferenceImage,
      motionStrength:    boostedMotion,
      maxDurationSecs:   10,
      reason:            `routing:animated`,
    };
  }

  return {
    seedanceModelId:   LUMA_VIDEO_MODEL,
    useI2V:            hasReferenceImage && speedMode !== 'draft',
    motionStrength:    0.62,
    maxDurationSecs:   10,
    reason:            `routing:${speedMode}-cinematic`,
  };
}

/** @deprecated Use getSeedanceRoute */
export const getKlingRoute = getSeedanceRoute;

function getMotionStrength(speedMode: string, combinedText: string, stylized = false): number {
  if (speedMode === 'ultra-draft') return 0.45;
  if (speedMode === 'draft')       return stylized ? 0.50 : 0.55;

  const t = combinedText.toLowerCase();
  const isDance   = /\b(danc|sway|shuffle|twirl|spin|jump|leap|bounce)\b/.test(t);
  const isAction  = /\b(run|sprint|cheer|fight|explod|flip|parkour|chase|battle)\b/.test(t);
  const isCalm    = /\b(gentle|calm|slow|emotional|tender|intimate|peaceful|serene|soft|still|standing|sitting)\b/.test(t);

  if (stylized) {
    if (isDance || isAction) return 0.65;
    if (isCalm)              return 0.55;
    return 0.60;
  }

  if (isAction || isDance) return 0.72;
  if (isCalm)              return 0.50;
  return 0.62;
}