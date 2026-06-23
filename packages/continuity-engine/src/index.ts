// @omnyra/continuity-engine — public API

// Types (re-exported — all consumers use this package for types)
export type {
  ContinuitySnapshot,
  BrandMemoryV2,
  BrandCharacterV2,
  BrandGlobalStyle,
  StoryState,
  CharacterStateV2,
  CharacterInteraction,
  CameraState,
  CameraPosition,
  CameraAngle,
  EnvironmentState,
  EnvironmentContinuityFlags,
  ObjectState,
  FirstFrameAnchor,
  FirstFrameMustMatch,
  ContinuityValidation,
  DriftResult,
  NarrativeRole,
  CameraType,
  LensType,
  TimeOfDay,
  AppearanceLock,
  WardrobeLock,
  CharacterStyleProfile,
} from "./types";

// Snapshot management
export {
  createInitialSnapshot,
  attachLastFrameToSnapshot,
  removeObject,
} from "./core/snapshot";

// State machine
export {
  buildNextScene,
} from "./core/transition-engine";

// Prompt builder + drift detector
export {
  buildPromptFromSnapshot,
  detectDrift,
} from "./core/state-machine";

// Validation
export {
  validate,
} from "./validation/validator";

export {
  preRenderCheck,
  type PreRenderCheckResult,
} from "./validation/pre-render-check";

export {
  DRIFT_THRESHOLDS,
} from "./validation/drift-thresholds";
