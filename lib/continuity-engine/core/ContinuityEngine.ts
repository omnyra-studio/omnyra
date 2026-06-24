import { ContinuitySnapshot }          from "./Snapshot";
import { StateTransition }             from "./StateTransition";
import { ContinuityValidator }         from "../validation/ContinuityValidator";
import { deepFreeze, IMMUTABILITY_RULES } from "../immutability";

const DRIFT_THRESHOLD = 0.08;

export class ContinuityEngine {
  private readonly validator  = new ContinuityValidator();
  private readonly transition = new StateTransition();

  /** Expose rules as a static constant so callers can reference them. */
  static readonly RULES = IMMUTABILITY_RULES;

  /**
   * ENTRY POINT — builds the next scene snapshot.
   *
   * Input is deep-frozen before use (prevents accidental mutation of caller's object).
   * Output is deep-frozen before return (prevents downstream mutation).
   * Throws if the resulting snapshot fails validation — prevents a bad API call.
   */
  buildNextSnapshot(current: ContinuitySnapshot): Readonly<ContinuitySnapshot> {
    const lockedInput = deepFreeze(structuredClone(current));
    const next = this.transition.computeNext(lockedInput);

    const validation = this.validator.validate(next);
    if (!validation.valid) {
      throw new Error(
        `[ContinuityEngine] Pre-render validation failed: ${validation.errors.join(", ")}`,
      );
    }

    return deepFreeze({ ...next, createdAt: Date.now() });
  }

  /**
   * POST-RENDER RECONCILIATION — call after each clip is returned.
   *
   * Compares the expected snapshot against the actual render output.
   * If drift exceeds DRIFT_THRESHOLD, the snapshot is corrected and
   * the caller should re-render with stricter constraints.
   *
   * @param expected  The snapshot used to build the Runway prompt
   * @param actual    Raw analysis of the rendered clip (e.g. from Claude Vision)
   */
  reconcileAfterRender(
    expected: ContinuitySnapshot,
    actual: Record<string, unknown>,
  ): { snapshot: ContinuitySnapshot; driftExceeded: boolean } {
    const drift = this.validator.detectDrift(expected, actual);

    if (drift.driftScore > DRIFT_THRESHOLD) {
      const corrected = this.transition.enforceCorrection(expected, drift);
      console.warn(
        `[ContinuityEngine] Drift exceeded threshold scene=${expected.sceneIndex} ` +
        `score=${drift.driftScore.toFixed(3)} face=${drift.faceSimilarity.toFixed(3)} cam=${drift.cameraDrift.toFixed(3)}`,
      );
      return { snapshot: corrected, driftExceeded: true };
    }

    return { snapshot: expected, driftExceeded: false };
  }

  /**
   * Convenience: attach a rendered last-frame URL to the snapshot.
   * Call this immediately after a successful clip to lock the anchor image.
   */
  attachLastFrame(
    snapshot: ContinuitySnapshot,
    imageUrl: string,
  ): ContinuitySnapshot {
    return {
      ...snapshot,
      firstFrame: { ...snapshot.firstFrame, imageUrl },
    };
  }
}
