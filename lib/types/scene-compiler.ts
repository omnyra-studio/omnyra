/**
 * Scene Compiler — master schema types.
 *
 * Every video generation passes through this deterministic layer:
 *   User input → compileSceneGraph() → SceneCompilerProject → render pipeline
 *
 * This is Omnyra's moat: a stateful, chainable story graph on top of
 * probabilistic video models (Kling, Runway, Flux).
 */

// ── Global style ──────────────────────────────────────────────────────────────

export interface GlobalStyle {
  visual_style:    string;  // e.g. "cinematic realism"
  lighting:        string;  // e.g. "roger deakins golden hour, soft contrast"
  color_grade:     string;  // e.g. "teal orange cinematic"
  fps:             number;  // 24 | 30
  aspect_ratio:    string;  // "9:16" | "16:9" | "1:1"
  camera_language: string;  // e.g. "slow tracking, shallow depth of field"
}

// ── Character bank ────────────────────────────────────────────────────────────

export interface Character {
  character_id:     string;  // "char_001"
  name:             string;
  reference_images: string[];
  appearance_lock:  string;  // full description — age, ethnicity, clothing, hair
  emotion_default:  string;  // "neutral" | "determined" | etc
}

// ── Scene graph ───────────────────────────────────────────────────────────────

export type NarrativeRole = "hook" | "development" | "climax" | "resolution";
export type FrameAnchorStrength = "none" | "low" | "medium" | "high" | "very_high";
export type ShotType =
  | "extreme close-up"
  | "close-up"
  | "medium close-up"
  | "medium shot"
  | "medium wide"
  | "wide shot"
  | "extreme wide"
  | "overhead"
  | "low angle"
  | "dutch angle";

export interface SceneTiming {
  start:    number;  // seconds
  end:      number;
  duration: number;
}

export interface CharacterState {
  primary_character_id: string;
  emotion:              string;
  action_state:         string;  // what they're physically doing
  wardrobe_lock:        boolean; // if true, no wardrobe deviation from appearance_lock
}

export interface SceneEnvironment {
  location:    string;
  weather:     string;
  key_objects: string[];
}

export interface SceneCamera {
  shot_type:          ShotType;
  movement:           string;   // "slow push-in", "side tracking", "static", etc
  position_lock:      boolean;
  transition_anchor?: string;   // "start_from_static_frame" etc
}

export interface SceneContinuity {
  uses_previous_frame:     boolean;
  frame_anchor_strength:   FrameAnchorStrength;
  transition_instruction?: string;   // explicit pose-continuation description
  seed_lock?:              number;   // shared seed across scene graph for consistency
  last_frame_url?:         string;   // populated at runtime after prior clip renders
}

export interface SceneDialogue {
  text:          string;
  voice_style:   string;
  sync_required: boolean;
}

export interface SceneNode {
  scene_id:                 string;   // "scene_01" etc
  timing:                   SceneTiming;
  narrative_role:           NarrativeRole;
  character_state:          CharacterState;
  environment:              SceneEnvironment;
  camera:                   SceneCamera;
  motion_brush_instructions: string[];
  dialogue:                 SceneDialogue;
  continuity:               SceneContinuity;

  // Compiled fields — generated from structured data above
  image_prompt:   string;   // used by Flux Dev for scene image generation
  video_prompt:   string;   // used by Kling for motion generation
  negative_prompt: string;
}

// ── Full project ──────────────────────────────────────────────────────────────

export interface SceneCompilerProject {
  project_id:    string;
  title:         string;
  niche:         string;
  global_style:  GlobalStyle;
  character_bank: Character[];
  scene_graph:   SceneNode[];

  // Runtime metadata
  compiled_at:   string;   // ISO timestamp
  compiler_version: string;
}

// ── Compiler input ────────────────────────────────────────────────────────────

export interface CompilerInput {
  script:           string;
  concept:          string;
  niche?:           string;
  hook?:            string;
  targetAudience?:  string;
  characterRef?:    string;    // appearance description or reference URL
  referenceImages?: string[];  // uploaded image URLs for character bank
  aspectRatio?:     string;
  sceneCount?:      number;    // default 4
}
