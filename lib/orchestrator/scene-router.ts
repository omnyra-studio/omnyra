// Scene router for the parallel orchestration engine.
//
// Routing precedence:
//   1. shots.render_assignment field ('avatar' | 'fal') — set at shot-plan creation
//   2. Multi-character scenes always → Kling
//   3. Classifier on combined visual_prompt + audio_intent
//   4. No character image → Kling fallback

import { routeModel }    from "@/lib/avatar/model-router";
import { classifyScene } from "@/lib/avatar/scene-classifier";
import { KLING_T2V_PRO } from "@/lib/video-models";
import { isMultiCharacterScene } from "./multi-character-handler";

export type Provider = "hedra" | "kling";

export interface ShotRoute {
  shotId:           string;
  shotNumber:       number;
  provider:         Provider;
  klingModelId?:    string;   // fal.ai model slug when provider=kling
  maxDurationSecs?: number;   // Hedra cap — keeps avatar shots short for speed
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
}

export function routeShot(shot: RoutableSot, opts: RouteOptions): ShotRoute {
  const { characterHasImage, draftMode = false, speedMode = 'balanced' } = opts;

  const label = `shot=${shot.id} num=${shot.shot_number}`;

  // ── 0. Multi-character — Hedra is single-character only ──────────────────────
  const multiChar = opts.isMultiCharacter ?? isMultiCharacterScene(shot.visual_prompt);
  if (multiChar) {
    const r: ShotRoute = { shotId: shot.id, shotNumber: shot.shot_number, provider: "kling", klingModelId: KLING_T2V_PRO, reason: "multi-character → kling" };
    console.info(`[ROUTER] → KLING ${label} reason=${r.reason}`);
    return r;
  }

  // ── 1. Explicit render_assignment from the shot-plan director ─────────────────
  if (shot.render_assignment === "avatar") {
    if (!characterHasImage) {
      const r: ShotRoute = { shotId: shot.id, shotNumber: shot.shot_number, provider: "kling", klingModelId: KLING_T2V_PRO, reason: "render_assignment=avatar but no character image → kling fallback" };
      console.info(`[ROUTER] → KLING ${label} reason=${r.reason}`);
      return r;
    }
    const maxDurationSecs = _hedraMaxSecs(speedMode);
    const r: ShotRoute = { shotId: shot.id, shotNumber: shot.shot_number, provider: "hedra", maxDurationSecs, reason: "render_assignment=avatar" };
    console.info(`[ROUTER] → HEDRA ${label} maxSecs=${maxDurationSecs} reason=${r.reason}`);
    return r;
  }

  if (shot.render_assignment === "fal") {
    const r: ShotRoute = { shotId: shot.id, shotNumber: shot.shot_number, provider: "kling", klingModelId: KLING_T2V_PRO, reason: "render_assignment=fal" };
    console.info(`[ROUTER] → KLING ${label} reason=${r.reason}`);
    return r;
  }

  // ── 2. Talking-scene fast-path — check before full classifier ────────────────
  // audio_intent is often the clearest signal ("He says...", "looks at camera").
  const combinedText = `${shot.visual_prompt} ${shot.audio_intent ?? ""}`.toLowerCase();
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

  const r: ShotRoute = { shotId: shot.id, shotNumber: shot.shot_number, provider: "kling", klingModelId: shot.fal_model ?? KLING_T2V_PRO, reason: `classifier: ${routing.reason}` };
  console.info(`[ROUTER] → KLING ${label} model=${r.klingModelId?.split("/").pop()} reason=${r.reason}`);
  return r;
}

// Hedra duration cap by speed mode — keeps avatar shots fast
function _hedraMaxSecs(speedMode: string): number {
  if (speedMode === 'draft')    return 10;
  if (speedMode === 'balanced') return 15;
  return 12;  // quality default
}
