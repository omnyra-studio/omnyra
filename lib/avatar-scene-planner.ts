/**
 * Director Core — Omnyra scene planner.
 *
 * Converts a script into an array of SceneSpec objects following the
 * Retention Arc architecture (hook → presenter → visual → presenter →
 * social_proof → presenter → cta).
 *
 * Two execution modes:
 *   1. LLM Director — invokes Anthropic Claude with the Director Core God
 *      Prompt, conditioned on creator + character memory.
 *   2. Deterministic fallback — WPS-based sentence grouping. Zero cost,
 *      always works, produces reasonable retention arc defaults.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { CreatorProfile } from "./creator-profile";
import type { Character } from "./character-registry";

// ── Types ──────────────────────────────────────────────────────────────────────

export type SceneArc = "hook" | "presenter" | "visual" | "social_proof" | "cta";
export type SceneProvider = "hedra" | "kling" | "tts";

export interface SceneSpec {
  index:              number;
  text:               string;          // script segment for TTS/performance
  visualPrompt:       string;          // image-to-video prompt (Kling / Hedra)
  shotType:           string;
  emotion:            string;
  motion:             string;
  estimatedDurationS: number;          // target seconds ≤ MAX_SCENE_S
  // Director Core extensions
  arc:                SceneArc;
  energy:             1 | 2 | 3 | 4 | 5;
  pacing:             "slow" | "measured" | "fast";
  deliveryStyle:      "direct" | "storytelling" | "conversational" | "rhetorical";
  emphasis:           string[];        // words to stress in TTS
  provider:           SceneProvider;   // routing signal: hedra=presenter, kling=b-roll
}

export interface CreatorContext {
  profile:   CreatorProfile | null;
  character: Character | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_SCENE_S = 10;
const MIN_SCENE_S = 6;
const WPS         = 2.2;
const MAX_SCENES  = 8;

const DEFAULT_VISUAL_PROMPT =
  "cinematic medium shot of person speaking, natural lighting, ultra-realistic, " +
  "film still, shallow depth of field, 35mm lens";

// Retention arc cycle — used by the deterministic fallback
const ARC_CYCLE: SceneArc[] = ["hook", "presenter", "visual", "presenter", "social_proof", "presenter", "cta"];

// Provider routing by arc type
const ARC_PROVIDER: Record<SceneArc, SceneProvider> = {
  hook:         "hedra",
  presenter:    "hedra",
  visual:       "kling",
  social_proof: "kling",
  cta:          "hedra",
};

// ── Director Core God Prompt ───────────────────────────────────────────────────

function buildDirectorCoreSystem(ctx: CreatorContext, maxScenes: number): string {
  const profile   = ctx.profile;
  const character = ctx.character;

  const creatorBlock = profile
    ? `ACTIVE CREATOR MEMORY (condition all output on this)
communication_style: ${profile.communication_style}
pacing: ${profile.pacing}
niche: ${profile.niche ?? "general"}
preferred_hooks: ${JSON.stringify(profile.preferred_hooks)}
preferred_ctas: ${JSON.stringify(profile.preferred_ctas)}
content_pillars: ${JSON.stringify(profile.content_pillars)}
visual_style: ${profile.visual_style ?? "cinematic"}
quality_score: ${profile.quality_score} (< 0.4 = reduce complexity, > 0.8 = full arc allowed)`
    : "CREATOR MEMORY: not loaded — use neutral conversational defaults.";

  const characterBlock = character
    ? `ACTIVE CHARACTER MEMORY (condition presenter scenes on this)
name: ${character.name}
core_prompt: ${character.core_prompt}
visual_signature: ${character.visual_signature}`
    : "CHARACTER MEMORY: not loaded — use default presenter framing.";

  return `You are the Director Core of Omnyra, a deterministic media production orchestration engine.

You do NOT generate media.
You DO orchestrate structured, multi-provider video production pipelines.

HARD CONSTRAINTS (NON-NEGOTIABLE)
You MUST NOT reference or route to any legacy systems:
- synclabs
- lipSyncVideo
- sync-lipsync
- any "standalone lipsync" pipeline
Any request implying those systems must be rejected internally and rerouted to the current Director + Character + Performance architecture.

There is exactly ONE valid pipeline:
  Director Core → Scene Planner → Provider Router (Hedra / Kling / TTS)
No exceptions.

CORE OBJECTIVE
Transform a script into a Retention Arc cinematic video that maximises:
- viewer retention
- clarity of message
- brand consistency (creator memory)
- performance quality (not raw generation quality)

${creatorBlock}

${characterBlock}

SCENE ARCHITECTURE (REQUIRED)
Every output MUST follow this arc unless quality_score < 0.4 (then simplify to 3 scenes max):
  1. HOOK          — pattern interrupt, open loop, bold claim
  2. PRESENTER     — authority introduction
  3. VISUAL PROOF  — B-roll evidence (Kling)
  4. PRESENTER     — deeper explanation
  5. SOCIAL PROOF  — example or testimonial (Kling)
  6. PRESENTER     — CTA setup
  7. CTA           — clear next action

ROUTING RULES (CRITICAL)
hedra  → presenter scenes, face-forward speaking, character performance
kling  → visual proof, B-roll, environmental / cinematic inserts
tts    → audio-only narration, voice-only segments

PERFORMANCE LOGIC
Condition energy on communication_style and pacing from creator memory:
  energy 5 → high urgency, fast delivery, intensity
  energy 3 → neutral, explanatory
  energy 1 → reflective, calm, measured

OUTPUT FORMAT (STRICT — return ONLY valid JSON, no markdown, no commentary)
{
  "arcType": "retention_arc",
  "scenes": [
    {
      "scene": <1-indexed number>,
      "arc": "hook | presenter | visual | social_proof | cta",
      "script": "<exact words spoken in this scene>",
      "emotion": "confident | curious | authoritative | urgent | reflective | enthusiastic | skeptical",
      "energy": <integer 1–5>,
      "pacing": "slow | measured | fast",
      "deliveryStyle": "direct | storytelling | conversational | rhetorical",
      "emphasis": ["word1", "word2"],
      "provider": "hedra | kling | tts",
      "visualPrompt": "<cinematic prompt: subject, environment, action, lighting, composition>",
      "shotType": "wide | medium | closeup | action | cutaway",
      "motion": "static | slow-pan | zoom-in | handheld",
      "estimatedDurationS": <number ${MIN_SCENE_S}–${MAX_SCENE_S}>
    }
  ]
}

HARD CONSTRAINTS
- MAX ${maxScenes} scenes
- NO duplicated meaning across scenes
- NO filler scenes
- MUST preserve full script intent
- Never exceed ~${MAX_SCENE_S}s per scene (at 2.2 words/second)
- Never create scenes shorter than ~${MIN_SCENE_S}s
- If script is unclear: infer simplest coherent interpretation — do NOT ask questions

OUTPUT RULE: Return ONLY JSON. No commentary. No markdown. No explanation.`;
}

// ── LLM Director ───────────────────────────────────────────────────────────────

interface RawGodScene {
  scene:              number;
  arc:                string;
  script:             string;
  emotion:            string;
  energy:             number;
  pacing:             string;
  deliveryStyle:      string;
  emphasis:           string[];
  provider:           string;
  visualPrompt?:      string;
  shotType?:          string;
  motion?:            string;
  estimatedDurationS?: number;
}

function clampEnergy(e: unknown): 1 | 2 | 3 | 4 | 5 {
  const n = Number(e);
  return (Math.max(1, Math.min(5, isNaN(n) ? 3 : Math.round(n))) as 1 | 2 | 3 | 4 | 5);
}

function coercePacing(p: unknown): "slow" | "measured" | "fast" {
  if (p === "slow" || p === "fast") return p;
  return "measured";
}

function coerceDelivery(d: unknown): "direct" | "storytelling" | "conversational" | "rhetorical" {
  if (d === "direct" || d === "storytelling" || d === "conversational" || d === "rhetorical") return d;
  return "direct";
}

function coerceArc(a: unknown): SceneArc {
  if (a === "hook" || a === "presenter" || a === "visual" || a === "social_proof" || a === "cta") return a;
  return "presenter";
}

function coerceProvider(p: unknown, arc: SceneArc): SceneProvider {
  if (p === "hedra" || p === "kling" || p === "tts") return p;
  return ARC_PROVIDER[arc];
}

async function planScenesLLM(
  script: string,
  ctx: CreatorContext,
  cap: number,
): Promise<SceneSpec[] | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const client   = new Anthropic({ apiKey });
    const system   = buildDirectorCoreSystem(ctx, cap);
    const response = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 3072,
      system,
      messages:   [{ role: "user", content: script }],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : null;
    if (!raw) return null;

    const parsed = JSON.parse(raw.trim()) as { scenes: RawGodScene[] };
    if (!Array.isArray(parsed.scenes) || !parsed.scenes.length) return null;

    return parsed.scenes.slice(0, cap).map((s, i) => {
      const arc      = coerceArc(s.arc);
      const energy   = clampEnergy(s.energy);
      const provider = coerceProvider(s.provider, arc);
      return {
        index:              i,
        text:               s.script || "",
        visualPrompt:       s.visualPrompt  || DEFAULT_VISUAL_PROMPT,
        shotType:           s.shotType      || "medium",
        emotion:            s.emotion       || "neutral",
        motion:             s.motion        || "static",
        estimatedDurationS: Math.max(MIN_SCENE_S, Math.min(MAX_SCENE_S, s.estimatedDurationS ?? 8)),
        arc,
        energy,
        pacing:             coercePacing(s.pacing),
        deliveryStyle:      coerceDelivery(s.deliveryStyle),
        emphasis:           Array.isArray(s.emphasis) ? s.emphasis : [],
        provider,
      };
    });
  } catch {
    return null;
  }
}

// ── Deterministic fallback ─────────────────────────────────────────────────────

export function planScenesDeterministic(script: string, ctx?: CreatorContext): SceneSpec[] {
  const rawSentences = script.match(/[^.!?]*[.!?]+\s*/g)?.map(s => s.trim()).filter(Boolean);
  const sentences    = rawSentences?.length ? rawSentences : [script.trim()];

  const scenes: SceneSpec[] = [];
  let current               = "";
  let wordCount             = 0;

  const defaultEnergy = ctx?.profile?.pacing === "fast" ? 4 :
                        ctx?.profile?.pacing === "slow" ? 2 : 3;

  const flush = () => {
    if (!current.trim()) return;
    const idx = scenes.length;
    const arc = ARC_CYCLE[Math.min(idx, ARC_CYCLE.length - 1)];
    scenes.push({
      index:              idx,
      text:               current.trim(),
      visualPrompt:       DEFAULT_VISUAL_PROMPT,
      shotType:           "medium",
      emotion:            "neutral",
      motion:             "static",
      estimatedDurationS: Math.max(MIN_SCENE_S, Math.min(MAX_SCENE_S, wordCount / WPS)),
      arc,
      energy:             defaultEnergy as 1 | 2 | 3 | 4 | 5,
      pacing:             coercePacing(ctx?.profile?.pacing),
      deliveryStyle:      coerceDelivery(ctx?.profile?.communication_style),
      emphasis:           [],
      provider:           ARC_PROVIDER[arc],
    });
    current   = "";
    wordCount = 0;
  };

  for (const sentence of sentences) {
    const sw       = sentence.split(/\s+/).filter(Boolean).length;
    const projected = (wordCount + sw) / WPS;
    if (scenes.length < MAX_SCENES - 1 && wordCount > 0 && projected > MAX_SCENE_S) flush();
    current   += (current ? " " : "") + sentence;
    wordCount += sw;
  }
  flush();

  if (!scenes.length) {
    scenes.push({
      index:              0,
      text:               script.trim(),
      visualPrompt:       DEFAULT_VISUAL_PROMPT,
      shotType:           "medium",
      emotion:            "neutral",
      motion:             "static",
      estimatedDurationS: Math.max(MIN_SCENE_S, Math.min(MAX_SCENE_S, script.split(/\s+/).length / WPS)),
      arc:                "presenter",
      energy:             3,
      pacing:             "measured",
      deliveryStyle:      "direct",
      emphasis:           [],
      provider:           "hedra",
    });
  }

  return scenes;
}

// ── Public entry point ─────────────────────────────────────────────────────────

/**
 * Plan scenes for a script.
 *
 * Attempts the LLM Director Core (requires ANTHROPIC_API_KEY) conditioned on
 * creator + character memory.  Falls back to the deterministic planner on
 * failure or missing key.
 *
 * maxScenes is capped by execution control (stable=3, balanced=5, aggressive=8).
 */
export async function planScenes(
  script: string,
  maxScenes = MAX_SCENES,
  ctx: CreatorContext = { profile: null, character: null },
): Promise<SceneSpec[]> {
  const cap       = Math.min(maxScenes, MAX_SCENES);
  const llmResult = await planScenesLLM(script, ctx, cap);

  if (llmResult) {
    console.log(`[director-core] LLM: scenes=${llmResult.length} cap=${cap} profile=${!!ctx.profile} character=${!!ctx.character}`);
    return llmResult;
  }

  const detResult = planScenesDeterministic(script, ctx).slice(0, cap);
  console.log(`[director-core] deterministic fallback: scenes=${detResult.length} cap=${cap}`);
  return detResult;
}
