import type { ContinuitySnapshot } from "./Snapshot";
import type { DriftReport }        from "../validation/ContinuityValidator";

const TENSION_STEP        = 0.08;
const ARC_STEP_PER_SCENE  = 0.15;
const CORRECTION_LIGHTING = "locked stable golden hour — no variation";

export class StateTransition {

  /**
   * Pure function — computes the next snapshot from the current one.
   * No I/O, no mutation of the input.
   */
  computeNext(current: ContinuitySnapshot): ContinuitySnapshot {
    const next: ContinuitySnapshot = structuredClone(current);

    next.sceneIndex = current.sceneIndex + 1;
    next.createdAt  = 0; // set by caller after validation

    next.story  = this.evolveStory(current);
    next.camera = this.inheritCamera(current);

    // Characters, objects, environment carry forward unchanged unless
    // explicitly updated by the Director between calls.
    // (No mutation — structuredClone already copied them.)

    // First-frame anchor always references the previous scene.
    next.firstFrame = {
      inheritsFromScene:    current.sceneIndex,
      freezeDurationSeconds: 2,
      imageUrl:             current.firstFrame.imageUrl, // updated post-render
      mustMatchExactly: {
        characterPoses: true,
        cameraState:    true,
        lighting:       true,
        environment:    true,
        objects:        true,
      },
    };

    return next;
  }

  /**
   * Correction path: called when drift score exceeds threshold.
   * Adjusts lighting and motion constraints to force re-lock.
   */
  enforceCorrection(
    snapshot: ContinuitySnapshot,
    drift: DriftReport,
  ): ContinuitySnapshot {
    const corrected = structuredClone(snapshot);

    if (drift.faceSimilarity < 0.90) {
      corrected.brand.globalStyle.lighting = CORRECTION_LIGHTING;
    }

    if (drift.cameraDrift > 0.15) {
      corrected.camera.type     = "static";
      corrected.camera.movement = "locked camera, no movement";
    }

    return corrected;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private evolveStory(state: ContinuitySnapshot) {
    return {
      ...state.story,
      sceneIndex:  state.sceneIndex + 1,
      tension:     Math.min(1, state.story.tension + TENSION_STEP),
      arcPosition: Math.min(1, state.story.arcPosition + ARC_STEP_PER_SCENE),
    };
  }

  private inheritCamera(state: ContinuitySnapshot) {
    return { ...state.camera };
  }
}
