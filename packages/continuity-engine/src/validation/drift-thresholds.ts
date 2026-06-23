/**
 * Drift thresholds — single source of truth.
 * Change these numbers to tune the validation gate globally.
 */

export const DRIFT_THRESHOLDS = {
  /** Overall drift above this → scene must be regenerated */
  REGEN_REQUIRED: 0.08,

  /** Face drift above this → brand character has drifted */
  FACE_DRIFT_MAX: 0.12,

  /** Wardrobe change above this → wardrobe lock violated */
  WARDROBE_DRIFT_MAX: 0.10,

  /** Camera movement deviation above this → continuity break */
  CAMERA_DRIFT_MAX: 0.15,

  /** Fraction of expected objects missing above this → object loss */
  OBJECT_LOSS_MAX: 0.20,

  /** Tension delta below this (mid-story) → emotion is flat → escalate */
  FLAT_EMOTION_DELTA: 0.10,

  /** Duration of first-frame freeze at scene start (seconds) */
  FIRST_FRAME_FREEZE_SECS: 2 as const,
} as const;

export type DriftThresholds = typeof DRIFT_THRESHOLDS;
