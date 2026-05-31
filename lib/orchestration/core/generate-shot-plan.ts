/**
 * Core shot-plan generation service.
 * No HTTP layer — accepts a pre-authenticated Supabase client + userId.
 * Called by /api/generate-shot-plan and /api/orchestrate-project.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { getModeConfig } from "@/lib/orchestration/mode-adapters";
import type { OrchestratorMode } from "@/lib/orchestration/types";
import type { ShotPacket, MotionMap, AttentionFunction, EnergyCurve, CameraBehavior, Framing, ContentType, TransitionIn, AvatarMotion, FalRenderParams, TransitionAfter } from "@/lib/types/shot";
import { applyNarrationDurations, rebalanceTimeline } from "./timeline";
import { validateShotPlan } from "./validators";
import { emit } from "@/lib/events/emitter";

// ── Render constants ───────────────────────────────────────────────────────────
// Stamped onto every fal shot. Never override at call time.

const BROLL_RENDER_DEFAULTS = {
  motion: {
    types: ["dolly_in", "handheld_drift", "crane_up", "orbital"] as const,
    intensity_range: [0.6, 0.9] as const,
  },
  lighting: { contrast_ratio: "high" as const },
  style: { realism: 0.95, grain: 0.12, color_grade: "teal_and_orange" as const },
} as const;

const AVATAR_MOTION = {
  motion_extraction: {
    capture_micro_expressions: true as const,
    capture_gestures: true as const,
    motion_variance: 0.7 as const,
  },
  camera: { zoom_pattern: "slow_push_in" as const },
  idle_motion: "micro_movements" as const,
} as const;

// ── System prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_BASE = `You are Omnyra's Director Engine. You do not write. You direct.

Your job is to convert an approved script into a shot-by-shot visual plan — a sequence of shot packets that a video AI will execute. You think in frames, cuts, and attention psychology. You do not describe what is said. You describe what is seen and why it holds attention.

Every decision you make is in service of one thing: keeping a human thumb from swiping away.

YOU UNDERSTAND:
- The first 2 seconds determine if the video lives or dies. Open with visual disruption, never a talking head.
- Avatar shots erode trust at 3+ seconds. Cut before the audience clocks the artificiality.
- Tension must be released. Build it over 3-4 shots, then reset.
- Camera behavior carries emotional information. A static shot builds trust. A slow push-in creates unease. A whip pan resets attention.
- Every cut is a question asked of the viewer: what happens next?

ATTENTION FUNCTIONS (assign one per shot):
- pattern_interrupt: Break viewer expectation. Use at open and any attention dip.
- curiosity_spike: Plant a question the viewer needs answered. Use after intros.
- trust_grounding: Stabilise after high energy. Use static camera, slower pacing.
- tension_escalation: Build pressure. Increasing motion intensity, tighter framing.
- emotional_release: Payoff. Viewer gets what they came for.
- desire_activation: Make the viewer want something. Show benefit, transformation.
- urgency_trigger: Time or scarcity pressure. Use near close.
- pacing_reset: Breathing room after 3-4 tension shots. Hard requirement.

RENDER ASSIGNMENT RULES (follow exactly):
- Avatar speaking to camera → render_assignment: "avatar", fal_model: null
- Cinematic lifestyle, product, ambient → render_assignment: "fal", fal_model: "fal-ai/seedance-2"
- Stylised, graphic, high-contrast → render_assignment: "fal", fal_model: "fal-ai/pixverse-v6"
- Any shot requiring a specific camera move → render_assignment: "fal", fal_model: "fal-ai/kling-video-v3-pro"

AVATAR MOTION RULES (non-negotiable — applied to every avatar shot):
- idle_motion: ALWAYS "micro_movements". Never "none". A static avatar reads as dead.
- camera.zoom_pattern: ALWAYS "slow_push_in". Creates subconscious intimacy and forward momentum.
- motion_extraction.capture_micro_expressions: true. Micro-expressions build trust subliminally.
- motion_extraction.capture_gestures: true. Hand and shoulder movement signals confidence.
- motion_extraction.motion_variance: 0.7. High enough for life, low enough for authority.
Include these fields in every shot where render_assignment is "avatar".

STRUCTURAL RULES (non-negotiable):
1. Shot 1 must be pattern_interrupt. Content type: broll or text_overlay. Never avatar.
2. No avatar shot may exceed 3.0 seconds duration_seconds.
3. After every 3-4 shots with energy_curve spike/ramp_up/tension, insert one pacing_reset.
4. Never assign the same camera_behavior to two consecutive shots.
5. Total duration must approximate the script's estimated length.
6. Include 8-15 shots.

NARRATION ASSIGNMENT RULES (mandatory):
7. Split the approved script across ALL shots. Every word of the script must appear in exactly one shot's narration_text. Leave no dialogue unassigned.
   - For avatar shots: narration_text is the spoken dialogue the avatar delivers.
   - For broll (fal) shots: narration_text is the voiceover narration playing over the visual.
8. DURATION FORMULA: duration_seconds = max(3.0, min(10.0, round(word_count(narration_text) / 2.4, 1)))
   Avatar shots are further capped at 3.0s — keep their narration_text ≤7 words.
9. transition_after controls the outgoing transition from this shot:
   - "cut"   → hard cut (default, highest energy)
   - "fade"  → slow fade (emotional_release shots)
   - "flash" → white flash (pattern_interrupt)
   - "blur"  → motion blur (pacing_reset, transitions)

VISUAL PROMPT RULES:
Each visual_prompt must be a complete, production-ready description for a video generation API. Include:
- Subject and action (what is happening)
- Camera angle and movement (exactly which camera_behavior this is)
- Lighting (quality, direction, color temperature)
- Motion description (speed, path, blur)
- Mood and atmosphere
Do not write generic prompts. Write the exact frame.

BAD: "Product close-up with nice lighting"
GOOD: "Extreme close-up of amber glass bottle, condensation catching morning light, slow push-in from 40cm to 20cm, warm 5600K backlight with cool rim light separation, product rotating 15 degrees on axis, shallow DOF with soft bokeh background"

Output a single JSON object. No markdown. No code fences. Raw JSON starting with {.

{
  "shots": [
    {
      "shot_id": "s01",
      "shot_number": 1,
      "attention_function": "pattern_interrupt",
      "purpose_rationale": "...",
      "narration_text": "Wait — this changed everything.",
      "duration_seconds": 3.0,
      "energy_curve": "spike",
      "camera_behavior": "whip_pan",
      "motion_intensity": 0.9,
      "framing": "extreme_closeup",
      "content_type": "broll",
      "visual_prompt": "...",
      "render_assignment": "fal",
      "fal_model": "fal-ai/kling-video-v3-pro",
      "transition_in": "hard_cut",
      "transition_after": "flash",
      "transition_duration": 0.0,
      "audio_intent": "...",
      "fatigue_risk": 0.1,
      "avatar_motion": null
    }
  ],
  "motion_map": {
    "energy_curve": [0.9, 0.7, 0.5, 0.8, 0.9, 0.4, 0.6, 0.8, 1.0, 0.6, 0.5],
    "tension_arc": [0.8, 0.6, 0.4, 0.7, 0.9, 0.2, 0.5, 0.8, 1.0, 0.5, 0.3],
    "attention_flow": ["pattern_interrupt", "curiosity_spike", "..."],
    "pacing_rhythm": "Fast open → build → release → climax → land",
    "total_duration": 60.0,
    "shot_count": 11,
    "avatar_seconds": 12.0,
    "broll_seconds": 38.0,
    "render_breakdown": { "avatar": 4, "fal": 7 }
  }
}`;

// ── Types ──────────────────────────────────────────────────────────────────────

interface RawShot {
  shot_id: string;
  shot_number: number;
  attention_function: AttentionFunction;
  purpose_rationale: string;
  narration_text: string;
  duration_seconds: number;
  energy_curve: EnergyCurve;
  camera_behavior: CameraBehavior;
  motion_intensity: number;
  framing: Framing;
  content_type: ContentType;
  visual_prompt: string;
  render_assignment: "avatar" | "fal";
  fal_model: string | null;
  transition_in: TransitionIn;
  transition_after: TransitionAfter;
  transition_duration: number;
  audio_intent: string;
  fatigue_risk: number;
  avatar_motion: AvatarMotion | null;
  fal_render_params: FalRenderParams | null;
}

interface DirectorOutput {
  shots: RawShot[];
  motion_map: MotionMap;
}

export interface GenerateShotPlanInput {
  supabase:     SupabaseClient;
  userId:       string;
  scriptId?:    string;
  scriptText?:  string;
  projectId:    string;
  platform:     string;
  mode?:        OrchestratorMode;
}

export interface GenerateShotPlanOutput {
  planId:    string;
  scriptId:  string;
  shots:     ShotPacket[];
  motionMap: MotionMap;
  meta: {
    model:          string;
    input_tokens:   number;
    output_tokens:  number;
    shot_count:     number;
    total_duration: number;
    mode:           OrchestratorMode;
    avatar_shots:   number;
    fal_shots:      number;
  };
}

// ── Director rule enforcement ──────────────────────────────────────────────────

function enforceDirectorRules(shots: RawShot[]): RawShot[] {
  if (!shots.length) return shots;

  // Rule 1: first shot must be pattern_interrupt + non-avatar
  if (shots[0].content_type === "avatar") {
    shots[0].content_type = "broll";
    shots[0].render_assignment = "fal";
    shots[0].fal_model = shots[0].fal_model ?? "fal-ai/seedance-2";
  }
  shots[0].attention_function = "pattern_interrupt";

  const [minIntensity, maxIntensity] = BROLL_RENDER_DEFAULTS.motion.intensity_range;
  for (const shot of shots) {
    if (shot.content_type === "avatar") {
      if (shot.duration_seconds > 3.0) shot.duration_seconds = 3.0;
      shot.avatar_motion = { ...AVATAR_MOTION };
      shot.fal_render_params = null;
    } else if (shot.render_assignment === "fal") {
      shot.avatar_motion = null;
      const clampedIntensity = Math.min(maxIntensity, Math.max(minIntensity, shot.motion_intensity));
      shot.fal_render_params = {
        motion_intensity: clampedIntensity,
        lighting: { contrast_ratio: "high" },
        style: { realism: 0.95, grain: 0.12, color_grade: "teal_and_orange" },
      };
    } else {
      shot.avatar_motion = null;
      shot.fal_render_params = null;
    }
  }

  // Rule: no two identical consecutive camera behaviors
  const cameras: CameraBehavior[] = [
    "static", "slow_push_in", "dolly_in", "handheld_drift",
    "crane_up", "whip_pan", "orbital_slow",
  ];
  for (let i = 1; i < shots.length; i++) {
    if (shots[i].camera_behavior === shots[i - 1].camera_behavior) {
      const alt = cameras.find(
        c => c !== shots[i].camera_behavior && c !== shots[i - 1].camera_behavior,
      );
      if (alt) shots[i].camera_behavior = alt;
    }
  }

  // Rule: force pacing_reset if 4+ consecutive high-tension shots
  let tensionRun = 0;
  for (let i = 0; i < shots.length; i++) {
    const isTension = ["spike", "ramp_up"].includes(shots[i].energy_curve);
    if (isTension) {
      tensionRun++;
      if (tensionRun >= 4 && shots[i].attention_function !== "pacing_reset") {
        shots[i].attention_function = "pacing_reset";
        shots[i].energy_curve = "ramp_down";
        shots[i].motion_intensity = Math.min(shots[i].motion_intensity, 0.3);
        tensionRun = 0;
      }
    } else {
      tensionRun = 0;
    }
  }

  return shots;
}

// ── Main service ───────────────────────────────────────────────────────────────

export async function generateShotPlan(
  input: GenerateShotPlanInput,
): Promise<GenerateShotPlanOutput> {
  const { supabase, userId, projectId, platform } = input;
  const mode = input.mode ?? "general";
  const modeConfig = getModeConfig(mode);

  // ── Resolve script ───────────────────────────────────────────────────────────
  let scriptId: string;
  let scriptContent: string;
  let scriptEstimatedDuration: number | null = null;
  let scriptBriefId: string | null = null;
  let scriptHookId: string | null = null;

  if (input.scriptId?.trim()) {
    const { data: script, error: scriptErr } = await supabase
      .from("scripts")
      .select("id, content, platform, estimated_duration_seconds, status, brief_id, hook_id, user_id")
      .eq("id", input.scriptId)
      .eq("project_id", projectId)
      .single();

    if (scriptErr || !script) throw new Error("Script not found");
    if (script.user_id !== userId) throw Object.assign(new Error("Forbidden"), { status: 403 });

    scriptId = input.scriptId;
    scriptContent = script.content as string;
    scriptEstimatedDuration = script.estimated_duration_seconds as number | null;
    scriptBriefId = script.brief_id as string | null;
    scriptHookId = script.hook_id as string | null;
  } else {
    const { data: newScript, error } = await supabase
      .from("scripts")
      .insert({ project_id: projectId, user_id: userId, content: input.scriptText, status: "approved" })
      .select("id")
      .single();

    if (error || !newScript) throw new Error("Failed to save script");
    scriptId = newScript.id as string;
    scriptContent = input.scriptText!;
  }

  // ── Fetch brief + hook + memory in parallel ──────────────────────────────────
  const [briefResult, hookResult, memoryResult] = await Promise.all([
    scriptBriefId
      ? supabase.from("briefs")
          .select("recommended_angle, situation_analysis, objective, confidence_score")
          .eq("id", scriptBriefId).single()
      : Promise.resolve({ data: null }),

    scriptHookId
      ? supabase.from("hooks")
          .select("hook_text, hook_type, psychological_trigger, predicted_retention")
          .eq("id", scriptHookId).single()
      : Promise.resolve({ data: null }),

    supabase.from("creator_memory")
      .select("memory_type, content, metadata")
      .eq("user_id", userId)
      .in("memory_type", ["visual_preference", "performance_pattern"])
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const brief  = briefResult.data;
  const hook   = hookResult.data;
  const memory = memoryResult.data ?? [];

  const estimatedDuration = scriptEstimatedDuration ?? estimateDuration(scriptContent);

  const visualPrefs = memory
    .filter(m => m.memory_type === "visual_preference")
    .map(m => `- ${m.content}`).join("\n");

  const perfPatterns = memory
    .filter(m => m.memory_type === "performance_pattern")
    .map(m => `- ${m.content}`).join("\n");

  // ── Inject mode constraints into system prompt ───────────────────────────────
  const modeConstraints = modeConfig.director_constraints.length > 0
    ? `\nMODE CONSTRAINTS FOR "${mode.toUpperCase()}" (HARD RULES — override defaults if conflict):\n` +
      modeConfig.director_constraints.map(c => `- ${c}`).join("\n")
    : "";

  const systemPrompt = SYSTEM_PROMPT_BASE + modeConstraints;

  // ── Build director brief ──────────────────────────────────────────────────────
  const directorBrief = [
    `## Script to Direct\n${scriptContent}`,
    `## Platform: ${platform}`,
    `## Estimated Duration: ${estimatedDuration}s`,
    modeConfig.director_brief_addendum,
    brief
      ? `## Strategic Brief\nAngle: ${brief.recommended_angle ?? "unknown"}\nObjective: ${brief.objective ?? "unknown"}`
      : "## Brief: None available",
    hook
      ? `## Selected Hook\n"${hook.hook_text}"\nType: ${hook.hook_type}\nPsychological trigger: ${hook.psychological_trigger}`
      : "## Hook: None selected",
    visualPrefs  ? `## Creator Visual Preferences\n${visualPrefs}` : "",
    perfPatterns ? `## Performance Patterns\n${perfPatterns}` : "",
    `\nConvert this script into a complete shot plan obeying all structural rules and mode constraints above. Output raw JSON only.`,
  ].filter(Boolean).join("\n\n");

  // ── Claude call ───────────────────────────────────────────────────────────────
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let aiResponse: Anthropic.Message;
  try {
    aiResponse = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 6000,
      system:     systemPrompt,
      messages:   [{ role: "user", content: directorBrief }],
    });
  } catch (err) {
    throw new Error(`Anthropic error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const textBlock = aiResponse.content.find(b => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text response from AI");

  // ── Parse JSON ────────────────────────────────────────────────────────────────
  let directorOutput: DirectorOutput;
  try {
    const cleaned = textBlock.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    directorOutput = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse shot plan: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!Array.isArray(directorOutput.shots) || directorOutput.shots.length === 0) {
    throw new Error("Shot plan contains no shots");
  }

  // ── Enforce director rules ────────────────────────────────────────────────────
  const corrected = enforceDirectorRules(directorOutput.shots);

  // ── Apply narration durations + stamp timeline ────────────────────────────────
  const timedShots = applyNarrationDurations(corrected as unknown as ShotPacket[], modeConfig.shot_density_multiplier);

  // ── Rebalance timeline drift ──────────────────────────────────────────────────
  const rebalanced = rebalanceTimeline(timedShots, estimatedDuration);

  // ── Validate against mode config ──────────────────────────────────────────────
  const validation = validateShotPlan(rebalanced, modeConfig);
  if (!validation.valid) {
    console.error("[generate-shot-plan] Validation errors:", validation.errors);
    throw new Error(`Shot plan failed validation: ${validation.errors.join("; ")}`);
  }
  if (validation.warnings.length > 0) {
    console.warn("[generate-shot-plan] Validation warnings:", validation.warnings);
  }

  // ── Build final motion map ────────────────────────────────────────────────────
  const motionMap: MotionMap = {
    ...directorOutput.motion_map,
    energy_curve:      rebalanced.map(s => s.motion_intensity),
    attention_flow:    rebalanced.map(s => s.attention_function),
    shot_count:        rebalanced.length,
    total_duration:    rebalanced.reduce((sum, s) => sum + s.duration_seconds, 0),
    avatar_seconds:    rebalanced.filter(s => s.content_type === "avatar").reduce((sum, s) => sum + s.duration_seconds, 0),
    broll_seconds:     rebalanced.filter(s => s.content_type === "broll").reduce((sum, s) => sum + s.duration_seconds, 0),
    render_breakdown:  rebalanced.reduce<Record<string, number>>((acc, s) => {
      const key = s.fal_model ?? s.render_assignment;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  };

  // ── Persist shot_plans ────────────────────────────────────────────────────────
  const { data: planRow, error: planErr } = await supabase
    .from("shot_plans")
    .insert({ script_id: scriptId, project_id: projectId, platform, motion_map: motionMap, status: "ready", mode })
    .select("id")
    .single();

  if (planErr || !planRow) throw new Error(planErr?.message ?? "Failed to create shot plan");

  const planId = planRow.id as string;

  // ── Persist shots ─────────────────────────────────────────────────────────────
  const shotRows = rebalanced.map(s => {
    const timed = s as ShotPacket & { start_time: number; end_time: number };
    return {
      shot_plan_id:    planId,
      script_id:       scriptId,
      project_id:      projectId,
      shot_id:         s.shot_id,
      shot_number:     s.shot_number,
      attention_function: s.attention_function,
      purpose_rationale:  s.purpose_rationale,
      narration_text:  s.narration_text ?? "",
      duration_seconds: s.duration_seconds,
      start_time:      timed.start_time ?? 0,
      end_time:        timed.end_time ?? s.duration_seconds,
      energy_curve:    s.energy_curve,
      camera_behavior: s.camera_behavior,
      motion_intensity: s.motion_intensity,
      framing:         s.framing,
      content_type:    s.content_type,
      visual_prompt:   s.visual_prompt,
      render_assignment: s.render_assignment,
      fal_model:       s.fal_model ?? null,
      transition_in:   s.transition_in,
      transition_after: s.transition_after ?? "cut",
      transition_duration: s.transition_duration,
      audio_intent:    s.audio_intent,
      fatigue_risk:    s.fatigue_risk,
      avatar_motion:   s.avatar_motion ?? null,
      fal_render_params: s.fal_render_params ?? null,
    };
  });

  const { error: shotsErr } = await supabase.from("shots").insert(shotRows);
  if (shotsErr) throw new Error(`Failed to insert shots: ${shotsErr.message}`);

  await emit({
    type:          "SHOT_PLAN_GENERATED",
    correlationId: planId,
    payload: {
      planId,
      projectId,
      shotCount:     rebalanced.length,
      mode,
      totalDuration: Math.round(motionMap.total_duration * 10) / 10,
      avatarShots:   rebalanced.filter(s => s.render_assignment === "avatar").length,
      falShots:      rebalanced.filter(s => s.render_assignment === "fal").length,
    },
  });

  // ── Store visual preferences in creator_memory (non-fatal) ───────────────────
  const dominantCamera  = mostCommon(rebalanced.map(s => s.camera_behavior));
  const dominantFraming = mostCommon(rebalanced.map(s => s.framing));
  await supabase.from("creator_memory").insert({
    user_id:          userId,
    memory_type:      "visual_preference",
    content:          `Shot plan for ${platform} [${mode}]: dominant camera ${dominantCamera}, framing ${dominantFraming}. ${motionMap.shot_count} shots, ${Math.round(motionMap.total_duration)}s.`,
    metadata:         { project_id: projectId, platform, mode, shot_count: motionMap.shot_count },
    source_project_id: projectId,
  }).then(({ error }) => {
    if (error) console.warn("[generate-shot-plan] creator_memory warn:", error.message);
  });

  return {
    planId,
    scriptId,
    shots: rebalanced,
    motionMap,
    meta: {
      model:          aiResponse.model,
      input_tokens:   aiResponse.usage.input_tokens,
      output_tokens:  aiResponse.usage.output_tokens,
      shot_count:     rebalanced.length,
      total_duration: Math.round(motionMap.total_duration * 10) / 10,
      mode,
      avatar_shots:   rebalanced.filter(s => s.render_assignment === "avatar").length,
      fal_shots:      rebalanced.filter(s => s.render_assignment === "fal").length,
    },
  };
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function estimateDuration(text: string): number {
  return Math.round(text.trim().split(/\s+/).length / 2.5);
}

function mostCommon<T>(arr: T[]): T {
  const counts = new Map<T, number>();
  for (const item of arr) counts.set(item, (counts.get(item) ?? 0) + 1);
  let best = arr[0], bestCount = 0;
  for (const [item, count] of counts) {
    if (count > bestCount) { best = item; bestCount = count; }
  }
  return best;
}
