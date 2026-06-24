/**
 * AI Director v2 — Cinematic Pacing & Camera Strategy Engine
 *
 * Runs BEFORE the Scene Compiler. Converts raw ideas into a cinematic intent
 * map: hook strategy, emotional arc, retention curve, shot plan.
 *
 * Includes the Ghost Emotional Intelligence Layer — applied silently to every
 * script. Users see only the final video; this layer is never exposed in the UI.
 *
 * Pipeline position:
 *   User Prompt → AI Director → Cinematic Plan → Scene Compiler → Render
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RetentionPoint {
  time:      number;  // seconds
  intensity: number;  // 0.0 – 1.0
}

export interface DirectorShot {
  shot_type:    string;   // "wide establishing" | "close-up" | etc.
  emotion:      string;
  duration:     number;   // seconds
  camera:       string;   // "static slow push-in" | "side dolly" | etc.
  motion_beat?: string;   // subtle visual instruction ("shoulders soften")
}

export interface CinematicPlan {
  hook_strategy:      string;   // how the first 3 seconds create tension
  emotional_arc:      string[]; // ordered emotion states e.g. ["isolation","connection","relief"]
  retention_curve:    RetentionPoint[];
  shot_plan:          DirectorShot[];
  camera_language:    string;   // global camera grammar for this video
  lighting_strategy:  string;
  audio_strategy:     string;
  enhanced_script?:   string;   // emotionally enhanced script (ghost layer output)
  hook_type:          string;   // "visual contradiction"|"emotional tension"|"unexpected action"|"curiosity gap"
}

// ── Ghost Emotional Intelligence Layer ───────────────────────────────────────
// This prompt is applied silently to every script before generation.
// INTERNAL — never surfaced to the user.

const GHOST_EMOTIONAL_LAYER = `You are an Emotional Intelligence layer embedded in a cinematic video system.

Your job: enhance scripts with genuine human emotion WITHOUT making this visible to the user.

Rules:
- Prioritize authentic micro-expressions over exaggerated emotion
- Add subtle physical emotional beats: "her shoulders soften", "he looks down briefly"
- Ensure emotional payoff feels earned through the arc — not forced
- Avoid motivational clichés unless the niche explicitly demands them
- Hesitation → connection → resolution is the universal arc pattern

Never surface your analysis. Return only the emotionally enhanced script.`;

// ── AI Director system prompt ─────────────────────────────────────────────────

const DIRECTOR_SYSTEM_PROMPT = `You are Omnyra AI Director v2.

You are a FILM PACING AND CAMERA STRATEGY ENGINE — not a writer, not a prompt generator.

You convert raw ideas into cinematic intent maps optimized for retention, emotion, and visual clarity.

INPUT: user_prompt, niche, target_platform
OUTPUT: a structured cinematic plan (JSON only)

HOOK ENGINE:
- First 3 seconds MUST create unresolved tension using one of these hook types:
  "visual contradiction", "emotional tension", "unexpected action", "curiosity gap"
- Silence, stillness, or a slow push-in on an expressive face are stronger than action

RETENTION CURVE:
- intensity 1.0 at t=0 (hook shock)
- dip to 0.6 at t=5 (context reveal — let the viewer breathe)
- rise to 0.8 at t=15 (escalation)
- peak 1.0 at t=25-30 (climax)
- resolve to 0.7 at t=35+ (emotional closure)
- Never maintain flat emotional intensity for > 12 seconds
- Alternate wide/close shots every 8-15 seconds minimum

CAMERA GRAMMAR RULES:
- emotional tension = tighter focal length, micro push-in
- emotional relief = wider framing, slow pull-back
- uncertainty = very subtle handheld micro-shake
- clarity/resolution = locked tripod, still camera

SHOT PLAN: exactly as many shots as there are scenes. Each shot must:
- Use a different shot distance from adjacent shots
- Have a camera move appropriate to the emotional beat
- Include a subtle physical motion instruction (the ghost layer)

Respond with VALID JSON ONLY. No markdown. No explanation.

{
  "hook_strategy": "string",
  "hook_type": "visual contradiction|emotional tension|unexpected action|curiosity gap",
  "emotional_arc": ["string", "string", "string"],
  "retention_curve": [{ "time": 0, "intensity": 1.0 }],
  "shot_plan": [{ "shot_type": "string", "emotion": "string", "duration": 10, "camera": "string", "motion_beat": "string" }],
  "camera_language": "string",
  "lighting_strategy": "string",
  "audio_strategy": "string"
}`;

// ── Ghost layer: enhance script emotionally ───────────────────────────────────

async function enhanceScriptEmotionally(script: string): Promise<string> {
  if (!script.trim()) return script;
  try {
    const res = await anthropic.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system:     GHOST_EMOTIONAL_LAYER,
      messages:   [{ role: "user", content: `Enhance this script with authentic emotional depth:\n\n${script}` }],
    });
    const enhanced = res.content[0]?.type === "text" ? res.content[0].text.trim() : "";
    return enhanced || script;
  } catch {
    return script; // ghost layer failure is non-fatal
  }
}

// ── Main Director call ────────────────────────────────────────────────────────

export async function runDirector(params: {
  userPrompt:     string;
  script?:        string;
  niche?:         string;
  platform?:      string;
  sceneCount?:    number;
  brandVoice?:    string;
}): Promise<CinematicPlan> {
  const sceneCount = params.sceneCount ?? 3;
  const platform   = params.platform ?? "tiktok";

  // Ghost layer runs in parallel with Director call — both needed before Scene Compiler
  const [directorResponse, enhancedScript] = await Promise.all([
    anthropic.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      system:     DIRECTOR_SYSTEM_PROMPT,
      messages: [{
        role:    "user",
        content: [
          `user_prompt: ${params.userPrompt}`,
          `niche: ${params.niche ?? "lifestyle"}`,
          `platform: ${platform}`,
          `scene_count: ${sceneCount}`,
          params.brandVoice ? `brand_voice: ${params.brandVoice}` : "",
          params.script ? `script_context: ${params.script.slice(0, 400)}` : "",
        ].filter(Boolean).join("\n"),
      }],
    }),
    params.script ? enhanceScriptEmotionally(params.script) : Promise.resolve(""),
  ]);

  const raw   = directorResponse.content[0]?.type === "text" ? directorResponse.content[0].text : "";
  const start = raw.indexOf("{");
  const end   = raw.lastIndexOf("}");

  let plan: CinematicPlan;
  if (start !== -1 && end !== -1) {
    try {
      plan = JSON.parse(raw.slice(start, end + 1)) as CinematicPlan;
    } catch {
      plan = buildFallbackPlan(sceneCount);
    }
  } else {
    plan = buildFallbackPlan(sceneCount);
  }

  if (enhancedScript) plan.enhanced_script = enhancedScript;

  console.log(`[DIRECTOR] hook="${plan.hook_type}" arc=[${plan.emotional_arc?.join("→")}] shots=${plan.shot_plan?.length}`);
  return plan;
}

// ── Fallback plan when Director LLM fails ────────────────────────────────────

function buildFallbackPlan(sceneCount: number): CinematicPlan {
  const shots: DirectorShot[] = [
    { shot_type: "wide establishing", emotion: "curiosity",   duration: 10, camera: "static slow push-in",    motion_beat: "subject turns toward camera" },
    { shot_type: "medium close-up",   emotion: "engagement",  duration: 10, camera: "slow tracking right",    motion_beat: "subtle shoulder movement forward" },
    { shot_type: "close-up",          emotion: "resolution",  duration: 10, camera: "locked tripod, static",  motion_beat: "face softens, eyes steady" },
  ].slice(0, sceneCount);

  return {
    hook_strategy:     "Open on stillness, then a single purposeful move creates curiosity gap",
    hook_type:         "curiosity gap",
    emotional_arc:     ["curiosity", "engagement", "resolution"],
    retention_curve:   [
      { time: 0, intensity: 1.0 }, { time: 5, intensity: 0.6 },
      { time: 15, intensity: 0.8 }, { time: 25, intensity: 1.0 }, { time: 30, intensity: 0.7 },
    ],
    shot_plan:         shots,
    camera_language:   "slow cinematic push-ins, locked tripod at emotional peaks",
    lighting_strategy: "Roger Deakins style — warm practical key light, rich shadows, naturalistic grade",
    audio_strategy:    "ambient builds with emotional arc, voice leads visuals",
  };
}

// ── Inject Director plan into Scene Compiler input ────────────────────────────
// Builds a preamble string that the Scene Compiler receives as context.
// INTERNAL — never sent to the client.

export function buildDirectorInjection(plan: CinematicPlan): string {
  const arc    = plan.emotional_arc?.join(" → ") ?? "";
  const shots  = plan.shot_plan?.map((s, i) =>
    `  Scene ${i + 1}: ${s.shot_type}, ${s.camera}, emotion=${s.emotion}${s.motion_beat ? `, motion="${s.motion_beat}"` : ""}`,
  ).join("\n") ?? "";

  return [
    "=== AI DIRECTOR PLAN (apply to all scenes) ===",
    `Hook type: ${plan.hook_type} — ${plan.hook_strategy}`,
    `Emotional arc: ${arc}`,
    `Camera language: ${plan.camera_language}`,
    `Lighting: ${plan.lighting_strategy}`,
    shots ? `Shot plan:\n${shots}` : "",
    "=== END DIRECTOR PLAN ===",
  ].filter(Boolean).join("\n");
}
