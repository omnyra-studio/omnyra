// Scene router for the parallel orchestration engine.
//
// Wraps the existing lib/avatar/model-router + lib/avatar/scene-classifier to
// produce a typed provider decision for each shot.
//
// Routing precedence:
//   1. shots.render_assignment field ('avatar' | 'fal') — set at shot-plan creation
//   2. If render_assignment is missing, classify the visual_prompt via routeModel()
//   3. Avatar shots without a character ref_frame_url fall back to Kling

import { routeModel }   from "@/lib/avatar/model-router";
import { classifyScene } from "@/lib/avatar/scene-classifier";
import { KLING_T2V_PRO, KLING_T2V_MODEL } from "@/lib/video-models";
import { isMultiCharacterScene } from "./multi-character-handler";

export type Provider = "hedra" | "kling";

export interface ShotRoute {
  shotId:        string;
  shotNumber:    number;
  provider:      Provider;
  klingModelId?: string;   // fal.ai model slug when provider=kling
  reason:        string;
}

export interface RoutableSot {
  id:                string;
  shot_number:       number;
  render_assignment: string | null;
  visual_prompt:     string;
  fal_model?:        string | null;
  content_type?:     string | null;
}

export interface RouteOptions {
  characterHasImage:  boolean;
  draftMode?:         boolean;
  isMultiCharacter?:  boolean;  // force Kling — two characters can't use Hedra
}

export function routeShot(shot: RoutableSot, opts: RouteOptions): ShotRoute {
  const { characterHasImage, draftMode = false } = opts;

  // ── 0. Multi-character override — Hedra is always single-character ────────────
  const multiChar = opts.isMultiCharacter ?? isMultiCharacterScene(shot.visual_prompt);
  if (multiChar) {
    return {
      shotId:       shot.id,
      shotNumber:   shot.shot_number,
      provider:     "kling",
      klingModelId: _pickKlingModel(shot, draftMode),
      reason:       "multi-character scene → kling i2v",
    };
  }

  // ── 1. Honour render_assignment from the shot plan director ──────────────────
  if (shot.render_assignment === "avatar") {
    if (!characterHasImage) {
      // Can't run Hedra without a character image — fall to Kling
      return {
        shotId:      shot.id,
        shotNumber:  shot.shot_number,
        provider:    "kling",
        klingModelId: _pickKlingModel(shot, draftMode),
        reason:      "render_assignment=avatar but no character image → kling fallback",
      };
    }
    return {
      shotId:     shot.id,
      shotNumber: shot.shot_number,
      provider:   "hedra",
      reason:     "render_assignment=avatar",
    };
  }

  if (shot.render_assignment === "fal") {
    return {
      shotId:      shot.id,
      shotNumber:  shot.shot_number,
      provider:    "kling",
      klingModelId: _pickKlingModel(shot, draftMode),
      reason:      "render_assignment=fal",
    };
  }

  // ── 2. Fallback: classify description ─────────────────────────────────────────
  const classification = classifyScene(shot.visual_prompt);
  const routing        = routeModel(classification);

  if (routing.model === "hedra" && characterHasImage) {
    return {
      shotId:     shot.id,
      shotNumber: shot.shot_number,
      provider:   "hedra",
      reason:     `classifier: ${routing.reason}`,
    };
  }

  return {
    shotId:      shot.id,
    shotNumber:  shot.shot_number,
    provider:    "kling",
    klingModelId: _pickKlingModel(shot, draftMode),
    reason:      `classifier: ${routing.reason}`,
  };
}

function _pickKlingModel(shot: RoutableSot, draftMode: boolean): string {
  if (shot.fal_model) return shot.fal_model;
  // draft → v1.6 standard (faster queue); balanced+ → v2.1 pro
  return draftMode ? KLING_T2V_MODEL : KLING_T2V_PRO;
}
