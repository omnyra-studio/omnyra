// Shared shot types — used by generate-shot-plan, shot-executor, and composer

export type AttentionFunction =
  | "pattern_interrupt" | "curiosity_spike" | "trust_grounding"
  | "tension_escalation" | "emotional_release" | "desire_activation"
  | "urgency_trigger" | "pacing_reset";

export type EnergyCurve    = "spike" | "ramp_up" | "ramp_down" | "sustain" | "pulse";
export type CameraBehavior = "static" | "slow_push_in" | "dolly_in" | "handheld_drift" | "crane_up" | "whip_pan" | "orbital_slow";
export type Framing        = "extreme_closeup" | "closeup" | "medium_closeup" | "medium" | "wide";
export type ContentType    = "avatar" | "broll" | "text_overlay" | "transition";
export type TransitionIn   = "hard_cut" | "soft_dissolve" | "whip_blur" | "light_streak";

export interface AvatarMotion {
  idle_motion: "micro_movements";
  camera: { zoom_pattern: "slow_push_in" };
  motion_extraction: {
    capture_micro_expressions: true;
    capture_gestures: true;
    motion_variance: 0.7;
  };
}

export interface FalRenderParams {
  motion_intensity: number;
  lighting: { contrast_ratio: "high" };
  style: { realism: 0.95; grain: 0.12; color_grade: "teal_and_orange" };
}

export type TransitionAfter = "cut" | "fade" | "flash" | "blur";

export interface ShotPacket {
  shot_id: string;
  shot_number: number;
  attention_function: AttentionFunction;
  purpose_rationale: string;
  duration_seconds: number;
  energy_curve: EnergyCurve;
  camera_behavior: CameraBehavior;
  motion_intensity: number;
  framing: Framing;
  content_type: ContentType;
  visual_prompt: string;
  render_assignment: "heygen" | "fal";
  fal_model: string | null;
  transition_in: TransitionIn;
  transition_duration: number;
  transition_after: TransitionAfter;  // outgoing transition from this shot
  audio_intent: string;
  narration_text: string;             // exact words spoken/narrated during this shot
  start_time: number;                 // cumulative timeline position (seconds)
  end_time: number;                   // cumulative end time (seconds)
  fatigue_risk: number;
  avatar_motion: AvatarMotion | null;
  fal_render_params: FalRenderParams | null;
  scene_image_url?: string | null;
}

export interface MotionMap {
  energy_curve: number[];
  tension_arc: number[];
  attention_flow: string[];
  pacing_rhythm: string;
  total_duration: number;
  shot_count: number;
  avatar_seconds: number;
  broll_seconds: number;
  render_breakdown: Record<string, number>;
}
