// Scene router for the parallel orchestration engine.
//
// Routing precedence:
//   1. shots.render_assignment field ('avatar' | 'fal') — set at shot-plan creation
//   2. Multi-character scenes always → Kling
//   3. Classifier on combined visual_prompt + audio_intent
//   4. No character image → Kling fallback

import { routeModel }    from "@/lib/avatar/model-router";
import { classifyScene } from "@/lib/avatar/scene-classifier";
import { KLING_T2V_PRO, KLING_T2V_MODEL } from "@/lib/video-models";
import { isMultiCharacterScene } from "./multi-character-handler";

// ultra-draft uses v3 standard (shorter queue, 5s clips are fast);
// all other modes use v3 pro for best motion quality.
function pickKlingT2V(speedMode: string): string {
  return speedMode === 'ultra-draft' ? KLING_T2V_MODEL : KLING_T2V_PRO;
}

export type Provider = "hedra" | "kling" | "runway";

export interface ShotRoute {
  shotId:           string;
  shotNumber:       number;
  provider:         Provider;
  klingModelId?:    string;   // fal.ai model slug when provider=kling
  maxDurationSecs?: number;   // Hedra cap — keeps avatar shots short for speed
  motionStrength?:  number;   // 0-1 for Kling cfg_scale mapping
  preferI2V?:       boolean;  // use image-to-video when char ref exists
  isStylized?:      boolean;  // stylized/cartoon character — affects neg prompts
  sourceImageProvider?: "getimg"; // generate source frame via GetImg before i2v
  reason:           string;
}

export interface RoutableSot {
  id:                string;
  shot_number:       number;
  render_assignment: string | null;
  visual_prompt:     string;
  audio_intent?:     string | null;  // combined with visual_prompt for classification
  fal_model?:        string | null;
  content_type?:     string | null;
}

export interface RouteOptions {
  characterHasImage: boolean;
  draftMode?:        boolean;
  speedMode?:        string;
  isMultiCharacter?: boolean;  // force Kling — two characters can't use Hedra
  enableRunway?:     boolean;  // opt-in: route quality i2v shots to Runway Gen-4
}

export function routeShot(shot: RoutableSot, opts: RouteOptions): ShotRoute {
  const { characterHasImage, draftMode = false, speedMode = 'balanced' } = opts;

  const label = `shot=${shot.id} num=${shot.shot_number}`;

  // ── 0. Multi-character — Hedra is single-character only ──────────────────────
  const multiChar = opts.isMultiCharacter ?? isMultiCharacterScene(shot.visual_prompt);
  const combinedText = `${shot.visual_prompt} ${shot.audio_intent ?? ""}`.toLowerCase();
  const stylized     = isStylizedCharacter(combinedText);

  if (multiChar) {
    const motionStrength = getMotionStrength(speedMode, combinedText, stylized);
    // Multi-character: t2v only (single ref image can't represent both chars)
    const r: ShotRoute = { shotId: shot.id, shotNumber: shot.shot_number, provider: "kling", klingModelId: pickKlingT2V(speedMode), motionStrength, isStylized: stylized, reason: "multi-character → kling" };
    console.info(`[ROUTER] → KLING ${label} reason=${r.reason} motion=${motionStrength} stylized=${stylized}`);
    return r;
  }

  // ── 1. Explicit render_assignment from the shot-plan director ─────────────────
  if (shot.render_assignment === "avatar") {
    if (!characterHasImage) {
      const motionStrength = getMotionStrength(speedMode, combinedText, stylized);
      const r: ShotRoute = { shotId: shot.id, shotNumber: shot.shot_number, provider: "kling", klingModelId: pickKlingT2V(speedMode), motionStrength, isStylized: stylized, reason: "render_assignment=avatar but no character image → kling fallback" };
      console.info(`[ROUTER] → KLING ${label} reason=${r.reason} motion=${motionStrength}`);
      return r;
    }
    const maxDurationSecs = _hedraMaxSecs(speedMode);
    const r: ShotRoute = { shotId: shot.id, shotNumber: shot.shot_number, provider: "hedra", maxDurationSecs, reason: "render_assignment=avatar" };
    console.info(`[ROUTER] → HEDRA ${label} maxSecs=${maxDurationSecs} reason=${r.reason}`);
    return r;
  }

  if (shot.render_assignment === "fal") {
    const motionStrength = getMotionStrength(speedMode, combinedText, stylized);
    // Prefer i2v for stylized characters when a reference image exists — better consistency
    const preferI2V = stylized && characterHasImage && speedMode !== 'ultra-draft';
    const r: ShotRoute = { shotId: shot.id, shotNumber: shot.shot_number, provider: "kling", klingModelId: pickKlingT2V(speedMode), motionStrength, preferI2V, isStylized: stylized, reason: "render_assignment=fal" };
    console.info(`[ROUTER] → KLING ${label} reason=${r.reason} motion=${motionStrength} i2v=${preferI2V} stylized=${stylized}`);
    return r;
  }

  // ── 2. Talking-scene fast-path — check before full classifier ────────────────
  const isTalkingScene = /\b(speaking|talking|says|narration|looking at camera|direct to camera|addresses camera|lip.?sync|voiceover|presenter|host|direct address)\b/.test(combinedText);

  if (isTalkingScene && characterHasImage && speedMode !== 'ultra-draft') {
    const maxDurationSecs = _hedraMaxSecs(speedMode);
    const r: ShotRoute = { shotId: shot.id, shotNumber: shot.shot_number, provider: "hedra", maxDurationSecs, reason: "talking-scene keyword match → hedra" };
    console.info(`[ROUTER] → HEDRA ${label} maxSecs=${maxDurationSecs} reason=${r.reason} text="${combinedText.slice(0, 60)}"`);
    return r;
  }

  // ── 3. Full classifier on combined text ───────────────────────────────────────
  const classification = classifyScene(combinedText);
  const routing        = routeModel(classification);

  if (routing.model === "hedra" && characterHasImage && speedMode !== 'ultra-draft') {
    const maxDurationSecs = _hedraMaxSecs(speedMode);
    const r: ShotRoute = { shotId: shot.id, shotNumber: shot.shot_number, provider: "hedra", maxDurationSecs, reason: `classifier: ${routing.reason}` };
    console.info(`[ROUTER] → HEDRA ${label} maxSecs=${maxDurationSecs} reason=${r.reason}`);
    return r;
  }

  // ── 4. Runway — quality i2v when explicitly enabled ─────────────────────────
  // Only when: opt-in flag set + character image available + quality mode.
  // Runway Gen-4 Turbo is i2v only and produces highest-quality results.
  if (opts.enableRunway && characterHasImage && speedMode === 'quality') {
    const r: ShotRoute = { shotId: shot.id, shotNumber: shot.shot_number, provider: "runway", reason: `runway quality i2v: ${routing.reason}` };
    console.info(`[ROUTER] → RUNWAY ${label} reason=${r.reason}`);
    return r;
  }

  const motionStrength = getMotionStrength(speedMode, combinedText, stylized);
  const preferI2V      = stylized && characterHasImage && speedMode !== 'ultra-draft';
  const r: ShotRoute = { shotId: shot.id, shotNumber: shot.shot_number, provider: "kling", klingModelId: shot.fal_model ?? pickKlingT2V(speedMode), motionStrength, preferI2V, isStylized: stylized, reason: `classifier: ${routing.reason}` };
  console.info(`[ROUTER] → KLING ${label} model=${r.klingModelId?.split("/").pop()} reason=${r.reason} motion=${motionStrength} i2v=${preferI2V} stylized=${stylized}`);
  return r;
}

// Hedra duration cap by speed mode — controls audio length fed to Hedra.
// Hedra generation time ≈ 3-5× audio length; raise cap only with adequate timeout.
function _hedraMaxSecs(speedMode: string): number {
  if (speedMode === 'ultra-draft') return 9;   // 22 words — fastest Hedra + 45s fallback
  if (speedMode === 'draft')       return 12;  // 30 words — quick with 60s fallback
  if (speedMode === 'balanced')    return 25;  // 62 words — 25s audio, 60s fallback → Kling
  return 30;  // quality: 75 words — 30s audio, 80s fallback
}

// Detects stylized / non-human characters that need softer motion tuning.
// High motion strength + complex fur/feathers = model artifact spiral.
function isStylizedCharacter(t: string): boolean {
  return /\b(big bird|snuffleupagus|snuffy|muppet|puppet|sesame|cartoon|anime|pokemon|furry|creature|monster|dragon|fairy|elf|gnome|troll|goblin|unicorn|dinosaur|robot|alien|plush|stuffed animal|mascot|disney|pixar|dreamworks|animated character|3d animation|cgi character|princess peach|mario|luigi|bowser|zelda|kirby|pikachu|yoshi|wario|donkey kong|abraham lincoln|george washington|napoleon|historical cartoon|fictional character|storybook)\b/.test(t);
}

// Motion strength for Kling — higher = more dynamic motion.
// Maps inversely to cfg_scale: strength 0.75 → cfg_scale 0.25 (free motion).
// Stylized characters use moderate strength to avoid artifact spiral.
function getMotionStrength(speedMode: string, combinedText: string, stylized = false): number {
  if (speedMode === 'ultra-draft') return 0.45;
  if (speedMode === 'draft')       return stylized ? 0.50 : 0.55;

  const t = combinedText.toLowerCase();
  const isDance   = /\b(danc|sway|shuffle|twirl|spin|jump|leap|bounce)\b/.test(t);
  const isAction  = /\b(run|sprint|cheer|fight|explod|flip|parkour|chase|battle)\b/.test(t);
  const isCalm    = /\b(gentle|calm|slow|emotional|tender|intimate|peaceful|serene|soft|still|standing|sitting)\b/.test(t);

  if (stylized) {
    // Animated/cartoon: higher motion for lively cartoon feel — CGI handles motion better than fur/feathers
    if (isDance || isAction) return 0.65;
    if (isCalm)              return 0.55;
    return 0.60;
  }

  // Realistic / human characters
  if (isAction || isDance) return 0.72;
  if (isCalm)              return 0.50;
  return 0.62;
}
