import type { ContinuitySnapshot } from "../types";
import { validate } from "./validator";

export interface PreRenderCheckResult {
  canRender: boolean;
  snapshot:  ContinuitySnapshot;
  errors:    string[];
  warnings:  string[];
}

/**
 * Final pre-render gate.
 * Called immediately before a scene is queued for rendering.
 * Returns canRender=false if snapshot is invalid — caller must NOT proceed.
 */
export function preRenderCheck(snapshot: ContinuitySnapshot): PreRenderCheckResult {
  const validation = validate(snapshot);

  // Stamp validation result into snapshot (non-mutating — returns new ref)
  const stamped: ContinuitySnapshot = {
    ...snapshot,
    validation,
  };

  if (!validation.passed) {
    console.error(
      `[PRE_RENDER_CHECK] BLOCKED scene=${snapshot.sceneIndex} project=${snapshot.projectId} ` +
      `drift=${validation.driftScore.toFixed(3)} errors=[${validation.errors.join(" | ")}]`,
    );
  } else if (validation.warnings.length > 0) {
    console.warn(
      `[PRE_RENDER_CHECK] WARNINGS scene=${snapshot.sceneIndex}: ${validation.warnings.join(" | ")}`,
    );
  }

  return {
    canRender: validation.passed,
    snapshot:  stamped,
    errors:    validation.errors,
    warnings:  validation.warnings,
  };
}
