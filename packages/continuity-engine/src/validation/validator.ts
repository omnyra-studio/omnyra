import type { ContinuitySnapshot, ContinuityValidation } from "../types";
import { DRIFT_THRESHOLDS } from "./drift-thresholds";

/**
 * Validation gate — NON-NEGOTIABLE.
 * Every snapshot passes through this before a render is queued.
 * If passed=false, the render must not proceed.
 */
export function validate(snapshot: ContinuitySnapshot): ContinuityValidation {
  const errors:   string[] = [];
  const warnings: string[] = [];
  let driftScore = 0;

  if (!snapshot.brand || !snapshot.brand.characters?.length) {
    errors.push("Missing brand memory — character appearance cannot be locked");
    driftScore += 0.2;
  }

  if (!snapshot.camera) {
    errors.push("Camera state missing — temporal drift risk");
    driftScore += 0.1;
  }

  if (snapshot.sceneIndex > 0 && !snapshot.firstFrame) {
    errors.push("Missing first-frame anchor — continuity break guaranteed");
    driftScore += 0.15;
  }

  if (snapshot.sceneIndex > 0 && !snapshot.firstFrame?.imageUrl) {
    warnings.push("First-frame imageUrl not set — 2s freeze will be soft");
  }

  if (
    typeof snapshot.story.tension !== "number" ||
    snapshot.story.tension < 0 ||
    snapshot.story.tension > 1
  ) {
    errors.push(`Invalid tension: ${snapshot.story.tension} (must be 0.0–1.0)`);
    driftScore += 0.05;
  }

  const charCount    = Object.keys(snapshot.characters ?? {}).length;
  const brandCount   = snapshot.brand?.characters?.length ?? 0;
  if (brandCount > 0 && charCount === 0) {
    errors.push("No character states in snapshot — brand references characters but none are active");
    driftScore += 0.1;
  }
  if (brandCount > 0 && charCount !== brandCount) {
    warnings.push(`Character count mismatch: brand=${brandCount} snapshot=${charCount}`);
    driftScore += 0.03;
  }

  if (!snapshot.environment?.location) {
    warnings.push("Environment location not set — may cause render inconsistency");
  }

  const passed = errors.length === 0 && driftScore <= DRIFT_THRESHOLDS.REGEN_REQUIRED;

  return { passed, driftScore, errors, warnings };
}
