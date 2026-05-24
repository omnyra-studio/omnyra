import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// ── System prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Omnyra's Director Engine. You do not write. You direct.

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
- Avatar speaking to camera → render_assignment: "heygen", fal_model: null
- Cinematic lifestyle, product, ambient → render_assignment: "fal", fal_model: "fal-ai/seedance-2"
- Stylised, graphic, high-contrast → render_assignment: "fal", fal_model: "fal-ai/pixverse-v6"
- Any shot requiring a specific camera move → render_assignment: "fal", fal_model: "fal-ai/kling-video-v3-pro"

STRUCTURAL RULES (non-negotiable):
1. Shot 1 must be pattern_interrupt. Content type: broll or text_overlay. Never avatar.
2. No avatar shot may exceed 3.0 seconds duration_seconds.
3. After every 3-4 shots with energy_curve spike/ramp_up/tension, insert one pacing_reset.
4. Never assign the same camera_behavior to two consecutive shots.
5. Total duration must approximate the script's estimated length.
6. Include 8-15 shots.

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
      "duration_seconds": 1.5,
      "energy_curve": "spike",
      "camera_behavior": "whip_pan",
      "motion_intensity": 0.9,
      "framing": "extreme_closeup",
      "content_type": "broll",
      "visual_prompt": "...",
      "render_assignment": "fal",
      "fal_model": "fal-ai/kling-video-v3-pro",
      "transition_in": "hard_cut",
      "transition_duration": 0.0,
      "audio_intent": "...",
      "fatigue_risk": 0.1
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
    "render_breakdown": { "heygen": 4, "fal": 7 }
  }
}`;

// ── Types ──────────────────────────────────────────────────────────────────────

type AttentionFunction =
  | "pattern_interrupt" | "curiosity_spike" | "trust_grounding"
  | "tension_escalation" | "emotional_release" | "desire_activation"
  | "urgency_trigger" | "pacing_reset";

type EnergyCurve    = "spike" | "ramp_up" | "ramp_down" | "sustain" | "pulse";
type CameraBehavior = "static" | "slow_push_in" | "dolly_in" | "handheld_drift" | "crane_up" | "whip_pan" | "orbital_slow";
type Framing        = "extreme_closeup" | "closeup" | "medium_closeup" | "medium" | "wide";
type ContentType    = "avatar" | "broll" | "text_overlay" | "transition";
type TransitionIn   = "hard_cut" | "soft_dissolve" | "whip_blur" | "light_streak";

interface ShotPacket {
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
  audio_intent: string;
  fatigue_risk: number;
}

interface MotionMap {
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

interface DirectorOutput {
  shots: ShotPacket[];
  motion_map: MotionMap;
}

// ── Validation & auto-correction ───────────────────────────────────────────────

function enforceDirectorRules(shots: ShotPacket[]): ShotPacket[] {
  if (!shots.length) return shots;

  // Rule 1: first shot must be pattern_interrupt + non-avatar
  if (shots[0].content_type === "avatar") {
    shots[0].content_type = "broll";
    shots[0].render_assignment = "fal";
    shots[0].fal_model = shots[0].fal_model ?? "fal-ai/seedance-2";
  }
  shots[0].attention_function = "pattern_interrupt";

  // Rule 2: cap avatar shots at 3s
  for (const shot of shots) {
    if (shot.content_type === "avatar" && shot.duration_seconds > 3.0) {
      shot.duration_seconds = 3.0;
    }
  }

  // Rule 3: break camera_behavior runs (no two identical consecutive)
  const cameras: CameraBehavior[] = [
    "static", "slow_push_in", "dolly_in", "handheld_drift",
    "crane_up", "whip_pan", "orbital_slow",
  ];
  for (let i = 1; i < shots.length; i++) {
    if (shots[i].camera_behavior === shots[i - 1].camera_behavior) {
      const alt = cameras.find(
        (c) => c !== shots[i].camera_behavior && c !== shots[i - 1].camera_behavior,
      );
      if (alt) shots[i].camera_behavior = alt;
    }
  }

  // Rule 4: insert pacing_reset if 4+ consecutive high-tension shots without one
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

// ── Route handler ──────────────────────────────────────────────────────────────

/**
 * POST /api/generate-shot-plan
 *
 * Converts an approved script into a sequence of director-quality shot packets,
 * each with attention psychology, render assignment, and visual prompt.
 * Stores the plan in shot_plans + shots tables.
 */
export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────────
  let body: { scriptId: string; projectId: string; platform: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { scriptId, projectId, platform } = body;
  if (!scriptId?.trim() || !projectId?.trim() || !platform?.trim()) {
    return NextResponse.json(
      { error: "Missing required fields: scriptId, projectId, platform" },
      { status: 400 },
    );
  }

  // ── Fetch script ──────────────────────────────────────────────────────────────
  const { data: script, error: scriptErr } = await supabase
    .from("scripts")
    .select("id, content, platform, estimated_duration_seconds, status, brief_id, hook_id, user_id")
    .eq("id", scriptId)
    .eq("project_id", projectId)
    .single();

  if (scriptErr || !script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }
  if (script.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Fetch brief + selected hook + visual memory in parallel ───────────────────
  const [briefResult, hookResult, memoryResult] = await Promise.all([
    script.brief_id
      ? supabase
          .from("briefs")
          .select("recommended_angle, situation_analysis, objective, confidence_score")
          .eq("id", script.brief_id)
          .single()
      : Promise.resolve({ data: null }),

    script.hook_id
      ? supabase
          .from("hooks")
          .select("hook_text, hook_type, psychological_trigger, predicted_retention")
          .eq("id", script.hook_id)
          .single()
      : Promise.resolve({ data: null }),

    supabase
      .from("creator_memory")
      .select("memory_type, content, metadata")
      .eq("user_id", user.id)
      .in("memory_type", ["visual_preference", "brief_generated", "performance_pattern"])
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const brief = briefResult.data;
  const hook = hookResult.data;
  const memory = memoryResult.data ?? [];

  // ── Build director brief ──────────────────────────────────────────────────────
  const estimatedDuration = script.estimated_duration_seconds ?? estimateDuration(script.content);

  const visualPreferences = memory
    .filter((m) => m.memory_type === "visual_preference")
    .map((m) => `- ${m.content}`)
    .join("\n");

  const performancePatterns = memory
    .filter((m) => m.memory_type === "performance_pattern")
    .map((m) => `- ${m.content}`)
    .join("\n");

  const directorBrief = [
    `## Script to Direct\n${script.content}`,

    `## Platform: ${platform}`,
    `## Estimated Duration: ${estimatedDuration}s`,

    brief
      ? `## Strategic Brief\nAngle: ${brief.recommended_angle ?? "unknown"}\nObjective: ${brief.objective ?? "unknown"}`
      : "## Brief: None available",

    hook
      ? `## Selected Hook\n"${hook.hook_text}"\nType: ${hook.hook_type}\nPsychological trigger: ${hook.psychological_trigger}\nPredicted retention: ${hook.predicted_retention ?? "unknown"}%`
      : "## Hook: None selected",

    visualPreferences
      ? `## Creator Visual Preferences (from memory)\n${visualPreferences}`
      : "## Creator Visual Preferences: No history yet",

    performancePatterns
      ? `## Performance Patterns\n${performancePatterns}`
      : "",

    `\nConvert this script into a complete shot plan. Follow all structural rules. Output raw JSON only.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  // ── Call Claude ───────────────────────────────────────────────────────────────
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let aiResponse: Anthropic.Message;
  try {
    aiResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 6000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: directorBrief }],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown Anthropic error";
    console.error("[generate-shot-plan] Anthropic error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // ── Extract and parse JSON ────────────────────────────────────────────────────
  const textBlock = aiResponse.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );

  if (!textBlock) {
    return NextResponse.json({ error: "No text response from AI" }, { status: 500 });
  }

  let directorOutput: DirectorOutput;
  try {
    const cleaned = textBlock.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    directorOutput = JSON.parse(cleaned);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Parse error";
    console.error("[generate-shot-plan] JSON parse failed:", msg, "\nRaw:\n", textBlock.text.slice(0, 600));
    return NextResponse.json(
      { error: "Failed to parse shot plan", detail: msg, preview: textBlock.text.slice(0, 500) },
      { status: 500 },
    );
  }

  if (!Array.isArray(directorOutput.shots) || directorOutput.shots.length === 0) {
    return NextResponse.json({ error: "Shot plan contains no shots" }, { status: 500 });
  }

  // ── Enforce director rules (auto-correct violations) ─────────────────────────
  const correctedShots = enforceDirectorRules(directorOutput.shots);

  // Rebuild motion_map values from corrected shots in case they shifted
  const motionMap: MotionMap = {
    ...directorOutput.motion_map,
    energy_curve: correctedShots.map((s) => s.motion_intensity),
    attention_flow: correctedShots.map((s) => s.attention_function),
    shot_count: correctedShots.length,
    total_duration: correctedShots.reduce((sum, s) => sum + s.duration_seconds, 0),
    avatar_seconds: correctedShots
      .filter((s) => s.content_type === "avatar")
      .reduce((sum, s) => sum + s.duration_seconds, 0),
    broll_seconds: correctedShots
      .filter((s) => s.content_type === "broll")
      .reduce((sum, s) => sum + s.duration_seconds, 0),
    render_breakdown: correctedShots.reduce<Record<string, number>>((acc, s) => {
      const key = s.fal_model ?? s.render_assignment;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  };

  // ── Persist: shot_plans ───────────────────────────────────────────────────────
  const { data: planRow, error: planErr } = await supabase
    .from("shot_plans")
    .insert({
      script_id: scriptId,
      project_id: projectId,
      platform,
      motion_map: motionMap,
      status: "ready",
    })
    .select("id")
    .single();

  if (planErr || !planRow) {
    console.error("[generate-shot-plan] shot_plans insert error:", planErr);
    return NextResponse.json({ error: planErr?.message ?? "Failed to create shot plan" }, { status: 500 });
  }

  const planId = planRow.id as string;

  // ── Persist: shots ────────────────────────────────────────────────────────────
  const shotRows = correctedShots.map((s) => ({
    shot_plan_id: planId,
    script_id: scriptId,
    project_id: projectId,
    shot_id: s.shot_id,
    shot_number: s.shot_number,
    attention_function: s.attention_function,
    purpose_rationale: s.purpose_rationale,
    duration_seconds: s.duration_seconds,
    energy_curve: s.energy_curve,
    camera_behavior: s.camera_behavior,
    motion_intensity: s.motion_intensity,
    framing: s.framing,
    content_type: s.content_type,
    visual_prompt: s.visual_prompt,
    render_assignment: s.render_assignment,
    fal_model: s.fal_model ?? null,
    transition_in: s.transition_in,
    transition_duration: s.transition_duration,
    audio_intent: s.audio_intent,
    fatigue_risk: s.fatigue_risk,
  }));

  const { data: insertedShots, error: shotsErr } = await supabase
    .from("shots")
    .insert(shotRows)
    .select("id, shot_id, shot_number, attention_function, content_type, render_assignment, fal_model, duration_seconds");

  if (shotsErr) {
    console.error("[generate-shot-plan] shots insert error:", shotsErr);
    return NextResponse.json({ error: shotsErr.message }, { status: 500 });
  }

  // ── Store visual preferences in creator_memory (non-fatal) ───────────────────
  // Note dominant camera style and render pattern for future plans
  const dominantCamera = mostCommon(correctedShots.map((s) => s.camera_behavior));
  const dominantFraming = mostCommon(correctedShots.map((s) => s.framing));

  await supabase.from("creator_memory").insert({
    user_id: user.id,
    memory_type: "visual_preference",
    content: `Shot plan for ${platform}: dominant camera ${dominantCamera}, dominant framing ${dominantFraming}. ${motionMap.shot_count} shots, ${Math.round(motionMap.total_duration)}s. Avatar: ${Math.round(motionMap.avatar_seconds)}s, B-roll: ${Math.round(motionMap.broll_seconds)}s.`,
    metadata: {
      project_id: projectId,
      platform,
      dominant_camera: dominantCamera,
      dominant_framing: dominantFraming,
      shot_count: motionMap.shot_count,
      total_duration: motionMap.total_duration,
    },
    source_project_id: projectId,
  }).then(({ error }) => {
    if (error) console.warn("[generate-shot-plan] creator_memory insert warning:", error);
  });

  // ── Response ──────────────────────────────────────────────────────────────────
  return NextResponse.json({
    success: true,
    plan_id: planId,
    shots: correctedShots,
    shots_with_ids: insertedShots ?? [],
    motion_map: motionMap,
    meta: {
      model: aiResponse.model,
      input_tokens: aiResponse.usage.input_tokens,
      output_tokens: aiResponse.usage.output_tokens,
      shot_count: correctedShots.length,
      total_duration: Math.round(motionMap.total_duration * 10) / 10,
      heygen_shots: correctedShots.filter((s) => s.render_assignment === "heygen").length,
      fal_shots: correctedShots.filter((s) => s.render_assignment === "fal").length,
    },
  });
}

// ── Utilities ──────────────────────────────────────────────────────────────────

/** Estimate duration from word count (~2.5 words/second for social video) */
function estimateDuration(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.round(words / 2.5);
}

function mostCommon<T>(arr: T[]): T {
  const counts = new Map<T, number>();
  for (const item of arr) counts.set(item, (counts.get(item) ?? 0) + 1);
  let best = arr[0];
  let bestCount = 0;
  for (const [item, count] of counts) {
    if (count > bestCount) { best = item; bestCount = count; }
  }
  return best;
}
