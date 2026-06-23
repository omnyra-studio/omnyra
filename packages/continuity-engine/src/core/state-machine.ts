import type { ContinuitySnapshot, DriftResult } from "../types";
import { DRIFT_THRESHOLDS } from "../validation/drift-thresholds";

/**
 * Prompt builder — assembles the final Kling/Runway video prompt
 * entirely from structured snapshot state. No freeform string stitching.
 */
export function buildPromptFromSnapshot(snapshot: ContinuitySnapshot): string {
  const char  = Object.values(snapshot.characters)[0];
  const brand = snapshot.brand.characters.find(c => c.id === char?.characterId);
  const env   = snapshot.environment;
  const cam   = snapshot.camera;
  const story = snapshot.story;

  const continuityPrefix = snapshot.sceneIndex > 0
    ? `Continue from last frame: ${char?.pose ?? "previous pose"} maintained for first ${DRIFT_THRESHOLDS.FIRST_FRAME_FREEZE_SECS} seconds. ${cam.movement} begins after ${DRIFT_THRESHOLDS.FIRST_FRAME_FREEZE_SECS}s. `
    : "";

  const charLine = brand
    ? `${brand.appearanceLock.face}, ${brand.appearanceLock.body}, ${brand.wardrobeLock.default}. `
    : "";

  const emotionLine = char
    ? `Expression: ${char.expression}. Gaze: ${char.gaze}. Pose: ${char.pose}. `
    : "";

  const cameraLine = `Camera: ${cam.type} ${cam.lens}, ${cam.movement}. `;

  const envLine = `Location: ${env.location}, ${env.timeOfDay.replace("_", " ")}, ${env.lightingDirection}. `;

  const objLine = Object.values(snapshot.objects)
    .filter(o => o.visibility)
    .map(o => `${o.type}${o.holder ? ` held by ${o.holder}` : ` at ${o.position}`}`)
    .join(", ");

  return [
    continuityPrefix,
    charLine,
    emotionLine,
    cameraLine,
    envLine,
    objLine ? `Objects: ${objLine}. ` : "",
    `Narrative beat: ${story.activeBeat}. Tension: ${Math.round(story.tension * 100)}%.`,
  ].filter(Boolean).join("").slice(0, 2500);
}

/**
 * Drift detector — post-render validation.
 * Compares expected snapshot state against what was actually rendered.
 *
 * Production: replace text heuristics with CLIP embedding similarity.
 */
export function detectDrift(
  expected: ContinuitySnapshot,
  actual: {
    characterDescription?: string;
    cameraMovement?:        string;
    objectsPresent?:        string[];
  },
): DriftResult {
  let cameraDrift  = 0;
  let objectLoss   = 0;

  if (actual.cameraMovement && expected.camera.movement) {
    const expTokens = new Set(expected.camera.movement.toLowerCase().split(/\s+/));
    const actTokens = actual.cameraMovement.toLowerCase().split(/\s+/);
    const overlap   = actTokens.filter(t => expTokens.has(t)).length;
    cameraDrift = actTokens.length > 0 ? Math.max(0, 1 - overlap / actTokens.length) : 0;
  }

  const expectedObjs = Object.keys(expected.objects);
  if (expectedObjs.length > 0 && actual.objectsPresent) {
    const missing = expectedObjs.filter(id =>
      !actual.objectsPresent!.some(o => o.toLowerCase().includes(id.toLowerCase())),
    );
    objectLoss = missing.length / expectedObjs.length;
  }

  const overallDrift  = Math.max(cameraDrift, objectLoss);
  const requiresRegen = overallDrift > DRIFT_THRESHOLDS.REGEN_REQUIRED;

  return {
    faceDrift:    0,  // requires CLIP embeddings — placeholder
    wardrobeDrift: 0, // requires CLIP embeddings — placeholder
    cameraDrift,
    objectLoss,
    overallDrift,
    requiresRegen,
  };
}
