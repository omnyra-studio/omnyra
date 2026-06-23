/**
 * Continuity Engine v2 — Full Type System
 *
 * Every scene render is a STATE TRANSITION, not a prompt.
 * The ContinuitySnapshot is the single source of truth.
 *
 * Immutable per-scene — each render produces a new snapshot
 * derived from the previous via structuredClone + state transition.
 */

// ── Brand Memory (IMMUTABLE across all scenes) ────────────────────────────────

export interface AppearanceLock {
  face:    string;   // "sharp jawline, brown eyes, mid-30s"
  body:    string;   // "lean athletic build, 5'10\""
  hair:    string;   // "short dark hair, natural style"
}

export interface WardrobeLock {
  default: string;   // "navy blue fitted shirt, dark jeans, white sneakers"
  // extend for scene-specific overrides if needed
}

export interface CharacterStyleProfile {
  lighting:       string;   // "Roger Deakins golden hour"
  colorGrade:     string;   // "teal orange cinematic"
  cinematicStyle: string;   // "shallow depth of field, 50mm portrait"
}

export interface BrandCharacterV2 {
  id:               string;
  name:             string;
  referenceImages:  string[];
  appearanceLock:   AppearanceLock;
  wardrobeLock:     WardrobeLock;
  voiceId:          string;
  styleProfile:     CharacterStyleProfile;
}

export interface BrandGlobalStyle {
  fps:        24 | 30;
  lighting:   string;
  colorGrade: string;
}

export interface BrandMemoryV2 {
  characters:  BrandCharacterV2[];
  globalStyle: BrandGlobalStyle;
}

// ── Story State (MUTABLE — evolves each scene) ────────────────────────────────

export type NarrativeRole = "hook" | "development" | "climax" | "resolution";

export interface StoryState {
  sceneIndex:       number;
  emotion:          string;    // dominant emotion this scene
  tension:          number;    // 0.0–1.0
  arcPosition:      number;    // 0.0–1.0 through story
  location:         string;
  activeBeat:       string;    // narrative event e.g. "protagonist reveals truth"
  activeCharacters: string[];  // character IDs present this scene
  nextIntent:       string;    // what the next scene must achieve
}

// ── Character State (PER-SCENE RUNTIME STATE) ─────────────────────────────────

export interface CharacterInteraction {
  target?: string;   // character_id of other character
  type?:   string;   // "eye_contact" | "touch" | "conversation"
}

export interface CharacterStateV2 {
  characterId: string;
  position:    string;   // "center frame, left third"
  pose:        string;   // "standing, weight forward"
  expression:  string;   // "hesitant half-smile"
  gaze:        string;   // "direct camera contact" | "45° left"
  velocity:    string;   // "stationary" | "slow walk forward" | "turning right"
  interaction?: CharacterInteraction;
}

// ── Camera State (STRICT CONTINUITY CORE) ────────────────────────────────────

export type CameraType = "static" | "tracking" | "dolly" | "handheld" | "crane";
export type LensType   = "24mm" | "35mm" | "50mm" | "85mm" | "135mm";

export interface CameraPosition {
  x: number;   // horizontal offset from center (–1 to 1)
  y: number;   // vertical (–1 to 1)
  z: number;   // depth / distance from subject (0 = very close, 10 = far)
}

export interface CameraAngle {
  pitch: number;   // degrees: + tilt down, – tilt up
  yaw:   number;   // degrees: + pan right, – pan left
  roll:  number;   // dutch angle degrees
}

export interface CameraState {
  type:      CameraType;
  position:  CameraPosition;
  angle:     CameraAngle;
  lens:      LensType;
  distance:  number;    // meters from subject
  movement:  string;    // "slow dolly forward at 0.3m/s"
}

// ── Environment State ─────────────────────────────────────────────────────────

export type TimeOfDay = "dawn" | "morning" | "day" | "golden_hour" | "dusk" | "night";

export interface EnvironmentContinuityFlags {
  roadWet:       boolean;
  crowdDensity:  number;    // 0–1
  fogLevel:      number;    // 0–1
}

export interface EnvironmentState {
  location:            string;
  timeOfDay:           TimeOfDay;
  weather:             string;
  lightingDirection:   string;   // "45° left, top-light"
  atmosphere:          string;   // "warm golden dust in air"
  continuityFlags:     EnvironmentContinuityFlags;
}

// ── Object State (NO MORE DISAPPEARING OBJECTS) ───────────────────────────────

export interface ObjectState {
  id:          string;
  type:        string;   // "coffee_cup" | "phone" | "umbrella"
  holder?:     string;   // character_id if held
  position:    string;   // "on table, left side" | "in right hand"
  visibility:  boolean;
}

// ── First Frame Anchor (CRITICAL — enforces 2s freeze continuity) ─────────────

export interface FirstFrameMustMatch {
  characterPoses: boolean;
  cameraState:    boolean;
  lighting:       boolean;
  environment:    boolean;
  objects:        boolean;
}

export interface FirstFrameAnchor {
  inheritsFromScene:    number;     // scene index this anchors from (-1 = none)
  imageUrl:             string | null;  // extracted last frame of previous clip
  mustMatchExactly:     FirstFrameMustMatch;
  freezeDurationSeconds: 2;         // ALWAYS 2 — this is the spec
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ContinuityValidation {
  passed:     boolean;
  driftScore: number;    // 0.0–1.0 (above 0.08 = fail)
  errors:     string[];
  warnings:   string[];
}

// ── Drift Detection Result (POST-RENDER) ──────────────────────────────────────

export interface DriftResult {
  faceDrift:    number;   // 0.0–1.0 (semantic similarity delta)
  wardrobeDrift: number;
  cameraDrift:  number;
  objectLoss:   number;   // fraction of expected objects missing
  overallDrift: number;   // max of above
  requiresRegen: boolean; // true if overallDrift > DRIFT_THRESHOLD
}

// ── THE PRIMARY ENTITY — ContinuitySnapshot ───────────────────────────────────

export interface ContinuitySnapshot {
  projectId:   string;
  sceneIndex:  number;

  brand:       BrandMemoryV2;        // immutable reference — NEVER mutated
  story:       StoryState;           // evolves each scene

  characters:  Record<string, CharacterStateV2>;  // keyed by character_id

  camera:      CameraState;

  environment: EnvironmentState;

  objects:     Record<string, ObjectState>;        // keyed by object id

  firstFrame:  FirstFrameAnchor;

  validation:  ContinuityValidation;

  timestamps: {
    createdAt: number;
  };
}
