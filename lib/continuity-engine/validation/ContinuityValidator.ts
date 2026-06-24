import type { ContinuitySnapshot } from "../core/Snapshot";
import type { ContinuityResult }   from "../types";

export type DriftReport = {
  faceSimilarity: number;  // 0–1 (1 = identical)
  cameraDrift:    number;  // 0–1 (0 = no drift)
  driftScore:     number;  // weighted combined (< 0.08 = OK)
};

export class ContinuityValidator {

  validate(snapshot: ContinuitySnapshot): ContinuityResult {
    const errors: string[] = [];

    if (!snapshot.brand)       errors.push("Missing brand memory");
    if (!snapshot.camera)      errors.push("Missing camera state");
    if (!snapshot.firstFrame)  errors.push("Missing first-frame anchor");
    if (!snapshot.environment) errors.push("Missing environment state");

    if (snapshot.story.tension < 0 || snapshot.story.tension > 1) {
      errors.push(`Invalid tension value: ${snapshot.story.tension}`);
    }

    if (snapshot.story.arcPosition < 0 || snapshot.story.arcPosition > 1) {
      errors.push(`Invalid arcPosition: ${snapshot.story.arcPosition}`);
    }

    return {
      valid:      errors.length === 0,
      driftScore: 0,
      errors,
    };
  }

  detectDrift(
    expected: ContinuitySnapshot,
    actual: Record<string, unknown>,
  ): DriftReport {
    const faceSimilarity = this.measureFaceSimilarity(expected, actual);
    const cameraDrift    = this.measureCameraDrift(expected, actual);

    const driftScore =
      (1 - faceSimilarity) * 0.5 +
      cameraDrift          * 0.5;

    return { faceSimilarity, cameraDrift, driftScore };
  }

  private measureFaceSimilarity(
    expected: ContinuitySnapshot,
    _actual: Record<string, unknown>,
  ): number {
    // Placeholder — replace with Claude Vision embedding comparison
    // when vision drift detection is run post-render.
    const charCount = Object.keys(expected.characters).length;
    return charCount > 0 ? 0.93 : 1.0;
  }

  private measureCameraDrift(
    _expected: ContinuitySnapshot,
    _actual: Record<string, unknown>,
  ): number {
    // Placeholder — replace with frame-level structural similarity
    return 0.04;
  }
}
