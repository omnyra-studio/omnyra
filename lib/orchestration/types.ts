export type OrchestratorMode = "storytime" | "influencer" | "product_launch" | "general";

export type ContentTypeName = "avatar" | "broll" | "text_overlay" | "transition";
export type PacingProfile   = "slow" | "medium" | "fast";
export type VoiceoverStyle  = "narrative" | "direct" | "advertising" | "conversational";

export interface ModeConfig {
  mode:                    OrchestratorMode;
  label:                   string;
  platform_default:        string;

  // Hard shot-count bounds enforced before DB write
  min_shots:               number;
  max_shots:               number;

  // Multiplier applied to the base word_count/2.4 duration formula
  // < 1.0 = denser pacing (faster), > 1.0 = more breathing room
  shot_density_multiplier: number;

  voiceover_style:         VoiceoverStyle;
  allowed_content_types:   ContentTypeName[];
  pacing_profile:          PacingProfile;

  // Injected as hard rules into the SYSTEM_PROMPT (non-negotiable constraints)
  director_constraints:    string[];

  // Injected as a labelled section in the user message (mode context)
  director_brief_addendum: string;
}

export interface OrchestrateInput {
  mode:        OrchestratorMode;
  projectId:   string;
  scriptId?:   string;
  scriptText?: string;
  platform?:   string;
}

export interface OrchestrateResult {
  project_id: string;
  plan_id:    string;
  mode:       OrchestratorMode;
}
