/**
 * @omnyra/continuity-engine — canonical type definitions.
 *
 * These types ARE the spec. Every other package imports from here.
 * Never define continuity types elsewhere.
 */

// ── Primitives ────────────────────────────────────────────────────────────────

export type NarrativeRole = "hook" | "development" | "climax" | "resolution";
export type CameraType    = "static" | "tracking" | "dolly" | "handheld" | "crane";
export type LensType      = "24mm" | "35mm" | "50mm" | "85mm" | "135mm";
export type TimeOfDay     = "dawn" | "morning" | "day" | "golden_hour" | "dusk" | "night";

// ── Brand Memory (IMMUTABLE) ──────────────────────────────────────────────────

export interface AppearanceLock {
  face:  string;
  body:  string;
  hair:  string;
}

export interface WardrobeLock {
  default: string;
}

export interface CharacterStyleProfile {
  lighting:       string;
  colorGrade:     string;
  cinematicStyle: string;
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

// ── Story State (MUTABLE per scene) ──────────────────────────────────────────

export interface StoryState {
  sceneIndex:       number;
  emotion:          string;
  tension:          number;   // 0.0–1.0
  arcPosition:      number;   // 0.0–1.0
  location:         string;
  activeBeat:       string;
  activeCharacters: string[];
  nextIntent:       string;
}

// ── Character State ───────────────────────────────────────────────────────────

export interface CharacterInteraction {
  target?: string;
  type?:   string;
}

export interface CharacterStateV2 {
  characterId:   string;
  position:      string;
  pose:          string;
  expression:    string;
  gaze:          string;
  velocity:      string;
  interaction?:  CharacterInteraction;
}

// ── Camera State ──────────────────────────────────────────────────────────────

export interface CameraPosition {
  x: number;
  y: number;
  z: number;
}

export interface CameraAngle {
  pitch: number;
  yaw:   number;
  roll:  number;
}

export interface CameraState {
  type:      CameraType;
  position:  CameraPosition;
  angle:     CameraAngle;
  lens:      LensType;
  distance:  number;
  movement:  string;
}

// ── Environment State ─────────────────────────────────────────────────────────

export interface EnvironmentContinuityFlags {
  roadWet:      boolean;
  crowdDensity: number;
  fogLevel:     number;
}

export interface EnvironmentState {
  location:          string;
  timeOfDay:         TimeOfDay;
  weather:           string;
  lightingDirection: string;
  atmosphere:        string;
  continuityFlags:   EnvironmentContinuityFlags;
}

// ── Object State ──────────────────────────────────────────────────────────────

export interface ObjectState {
  id:         string;
  type:       string;
  holder?:    string;
  position:   string;
  visibility: boolean;
}

// ── First Frame Anchor ────────────────────────────────────────────────────────

export interface FirstFrameMustMatch {
  characterPoses: boolean;
  cameraState:    boolean;
  lighting:       boolean;
  environment:    boolean;
  objects:        boolean;
}

export interface FirstFrameAnchor {
  inheritsFromScene:     number;
  imageUrl:              string | null;
  mustMatchExactly:      FirstFrameMustMatch;
  freezeDurationSeconds: 2;
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ContinuityValidation {
  passed:     boolean;
  driftScore: number;
  errors:     string[];
  warnings:   string[];
}

// ── Drift Detection ───────────────────────────────────────────────────────────

export interface DriftResult {
  faceDrift:     number;
  wardrobeDrift: number;
  cameraDrift:   number;
  objectLoss:    number;
  overallDrift:  number;
  requiresRegen: boolean;
}

// ── PRIMARY ENTITY ────────────────────────────────────────────────────────────

export interface ContinuitySnapshot {
  projectId:   string;
  sceneIndex:  number;
  brand:       BrandMemoryV2;
  story:       StoryState;
  characters:  Record<string, CharacterStateV2>;
  camera:      CameraState;
  environment: EnvironmentState;
  objects:     Record<string, ObjectState>;
  firstFrame:  FirstFrameAnchor;
  validation:  ContinuityValidation;
  timestamps:  { createdAt: number };
}
