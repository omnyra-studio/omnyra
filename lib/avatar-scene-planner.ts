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
export type SceneProvider = "hedra" | "kling" | "smart_motion" | "tts";
export type SceneType =
  | "talking_head"
  | "avatar"
  | "lifestyle_broll"
  | "product_demo"
  | "emotional"
  | "quote"
  | "educational"
  | "cta"
  | "background"
  | "transition";

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
  sceneType:          SceneType;       // classification for intelligent routing
  energy:             1 | 2 | 3 | 4 | 5;
  pacing:             "slow" | "measured" | "fast";
  deliveryStyle:      "direct" | "storytelling" | "conversational" | "rhetorical";
  emphasis:           string[];        // words to stress in TTS
  provider:           SceneProvider;   // routing: hedra=avatar, kling=premium broll, smart_motion=lightweight
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

// Provider routing by arc type (baseline — overridden by scene type routing below)
const ARC_PROVIDER: Record<SceneArc, SceneProvider> = {
  hook:         "hedra",
  presenter:    "hedra",
  visual:       "kling",
  social_proof: "kling",
  cta:          "hedra",
};

// Scene type → provider routing (overrides arc-based routing)
const SCENE_TYPE_PROVIDER: Record<SceneType, SceneProvider> = {
  talking_head:   "hedra",
  avatar:         "hedra",
  lifestyle_broll:"kling",
  product_demo:   "kling",
  emotional:      "kling",
  quote:          "smart_motion",
  educational:    "smart_motion",
  cta:            "smart_motion",
  background:     "smart_motion",
  transition:     "smart_motion",
};

// Arc → scene type fallback when LLM doesn't classify
const ARC_SCENE_TYPE: Record<SceneArc, SceneType> = {
  hook:         "talking_head",
  presenter:    "avatar",
  visual:       "lifestyle_broll",
  social_proof: "lifestyle_broll",
  cta:          "cta",
};

// Motion budget: max premium scenes (hedra + kling) per 30-second video.
// Smart motion scenes are always allowed regardless of budget.
const PREMIUM_SCENES_PER_30S = 2;

function computeMotionBudget(scenes: SceneSpec[]): SceneSpec[] {
  const totalDurationS = scenes.reduce((s, sc) => s + sc.estimatedDurationS, 0);
  const budgetUnits = Math.ceil((totalDurationS / 30) * PREMIUM_SCENES_PER_30S);
  const maxPremium  = Math.max(budgetUnits, 2); // always allow at least 2

  let premiumUsed = 0;
  return scenes.map((sc) => {
    const isPremium = sc.provider === "hedra" || sc.provider === "kling";
    if (isPremium && premiumUsed < maxPremium) {
      premiumUsed++;
      return sc;
    }
    if (isPremium) {
      // Downgrade to smart_motion
      return { ...sc, provider: "smart_motion" as SceneProvider };
    }
    return sc;
  });
}

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
hedra        → talking_head, avatar (presenter, face-forward, character performance)
kling        → lifestyle_broll, product_demo, emotional (premium motion B-roll)
smart_motion → quote, educational, cta, background, transition (lightweight cinematic motion)
tts          → audio-only narration, voice-only segments

MOTION BUDGET
Max 2 premium scenes (hedra + kling) per 30 seconds of video.
All other scenes MUST use smart_motion or tts. Never default all scenes to kling.

SCENE TYPE CLASSIFICATION
Every scene MUST include a "sceneType" field from:
  talking_head | avatar | lifestyle_broll | product_demo | emotional | quote | educational | cta | background | transition

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
      "sceneType": "talking_head | avatar | lifestyle_broll | product_demo | emotional | quote | educational | cta | background | transition",
      "script": "<exact words spoken in this scene>",
      "emotion": "confident | curious | authoritative | urgent | reflective | enthusiastic | skeptical",
      "energy": <integer 1–5>,
      "pacing": "slow | measured | fast",
      "deliveryStyle": "direct | storytelling | conversational | rhetorical",
      "emphasis": ["word1", "word2"],
      "provider": "hedra | kling | smart_motion | tts",
      "visualPrompt": "<cinematic prompt: subject, environment, action, lighting, composition>",
      "shotType": "wide | medium | closeup | action | cutaway",
      "motion": "static | slow-pan | zoom-in | handheld | push-in | pull-out | pan-left | pan-right | tilt | parallax",
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
  sceneType?:         string;
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

function coerceProvider(p: unknown, arc: SceneArc, sceneType?: SceneType): SceneProvider {
  if (p === "hedra" || p === "kling" || p === "smart_motion" || p === "tts") return p;
  // Fall back to scene type routing, then arc routing
  if (sceneType) return SCENE_TYPE_PROVIDER[sceneType];
  return ARC_PROVIDER[arc];
}

function coerceSceneType(t: unknown, arc: SceneArc): SceneType {
  const valid: SceneType[] = [
    "talking_head", "avatar", "lifestyle_broll", "product_demo", "emotional",
    "quote", "educational", "cta", "background", "transition",
  ];
  if (valid.includes(t as SceneType)) return t as SceneType;
  return ARC_SCENE_TYPE[arc];
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

    const rawScenes = parsed.scenes.slice(0, cap).map((s, i) => {
      const arc       = coerceArc(s.arc);
      const sceneType = coerceSceneType(s.sceneType, arc);
      const energy    = clampEnergy(s.energy);
      const provider  = coerceProvider(s.provider, arc, sceneType);
      console.log(`[SCENE_CLASSIFICATION] { scene: ${i + 1}, type: "${sceneType}", provider: "${provider}" }`);
      return {
        index:              i,
        text:               s.script || "",
        visualPrompt:       s.visualPrompt  || DEFAULT_VISUAL_PROMPT,
        shotType:           s.shotType      || "medium",
        emotion:            s.emotion       || "neutral",
        motion:             s.motion        || "static",
        estimatedDurationS: Math.max(MIN_SCENE_S, Math.min(MAX_SCENE_S, s.estimatedDurationS ?? 8)),
        arc,
        sceneType,
        energy,
        pacing:             coercePacing(s.pacing),
        deliveryStyle:      coerceDelivery(s.deliveryStyle),
        emphasis:           Array.isArray(s.emphasis) ? s.emphasis : [],
        provider,
      } satisfies SceneSpec;
    });

    const budgeted = computeMotionBudget(rawScenes);
    const hedra    = budgeted.filter(s => s.provider === "hedra").length;
    const kling    = budgeted.filter(s => s.provider === "kling").length;
    const sm       = budgeted.filter(s => s.provider === "smart_motion").length;
    console.log(`[PROVIDER_USAGE] { hedraScenes: ${hedra}, klingScenes: ${kling}, smartMotionScenes: ${sm} }`);
    return budgeted;
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
    const idx       = scenes.length;
    const arc       = ARC_CYCLE[Math.min(idx, ARC_CYCLE.length - 1)];
    const sceneType = ARC_SCENE_TYPE[arc];
    const provider  = SCENE_TYPE_PROVIDER[sceneType];
    scenes.push({
      index:              idx,
      text:               current.trim(),
      visualPrompt:       DEFAULT_VISUAL_PROMPT,
      shotType:           "medium",
      emotion:            "neutral",
      motion:             "static",
      estimatedDurationS: Math.max(MIN_SCENE_S, Math.min(MAX_SCENE_S, wordCount / WPS)),
      arc,
      sceneType,
      energy:             defaultEnergy as 1 | 2 | 3 | 4 | 5,
      pacing:             coercePacing(ctx?.profile?.pacing),
      deliveryStyle:      coerceDelivery(ctx?.profile?.communication_style),
      emphasis:           [],
      provider,
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
      sceneType:          "avatar",
      energy:             3,
      pacing:             "measured",
      deliveryStyle:      "direct",
      emphasis:           [],
      provider:           "hedra",
    });
  }

  return computeMotionBudget(scenes);
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
