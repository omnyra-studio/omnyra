/**
 * Avatar scene planner.
 *
 * Converts a script into an array of SceneSpec objects — one per Kling
 * generation + TTS call + SyncLabs call.  Each spec carries the text for TTS,
 * a visual prompt for Kling, shot metadata, and an estimated duration.
 *
 * Two execution modes (tried in order):
 *   1. LLM Director — calls Anthropic Claude with the Director Core system
 *      prompt.  Produces semantically-aware, cinematically-structured specs.
 *      Requires ANTHROPIC_API_KEY in env.
 *
 *   2. Deterministic fallback — WPS-based sentence grouping with hard
 *      scene-duration constraints.  Always works, zero cost, slightly less
 *      cinematic.
 */

import Anthropic from "@anthropic-ai/sdk";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SceneSpec {
  index:             number;
  text:              string;   // script segment for TTS
  visualPrompt:      string;   // Kling i2v prompt
  shotType:          string;
  emotion:           string;
  motion:            string;
  estimatedDurationS: number;  // target seconds (≤ KLING_CLIP_DURATION)
}

// ── Constants ──────────────────────────────────────────────────────────────────

const KLING_CLIP_DURATION = 10;   // seconds — must match animateImage() call
const WPS                 = 2.2;  // average words per second in speech
const MIN_SCENE_S         = 6;
const MAX_SCENE_S         = KLING_CLIP_DURATION;
const MAX_SCENES          = 8;

const DEFAULT_VISUAL_PROMPT =
  "cinematic medium shot of person speaking, natural lighting, ultra-realistic, " +
  "film still, shallow depth of field, 35mm lens";

// ── Director Core system prompt ────────────────────────────────────────────────

const DIRECTOR_CORE_SYSTEM = `You are a cinematic director that converts scripts into structured video scene plans for an automated generation pipeline.

You do not write prose. You do not explain. You only output structured scene specifications as valid JSON.

PRIMARY OBJECTIVE
Transform any input script into an optimal set of video scenes that:
- preserve narrative meaning
- maximize visual clarity per scene
- maintain emotional progression
- are suitable for parallel video generation (image-to-video model: Kling)
- respect runtime constraints: 6–10 seconds per scene, maximum ${MAX_SCENES} scenes

SCENE DESIGN RULES
Each scene MUST:
1. Represent a single coherent idea or visual moment
2. Be self-contained — no reliance on other scenes for meaning
3. Be visually generatable by Kling (image-to-video model)
4. Have clear cinematic direction
5. NOT exceed ${MAX_SCENE_S} seconds estimated spoken duration

OUTPUT SCHEMA (STRICT — return ONLY valid JSON)
{
  "scenes": [
    {
      "text": "<script segment for TTS — exact words spoken in this scene>",
      "shotType": "wide | medium | closeup | action | cutaway",
      "emotion": "neutral | calm | intense | urgent | dramatic",
      "motion": "static | slow-pan | zoom-in | handheld",
      "visualPrompt": "<cinematic prompt for Kling: subject, environment, action, lighting, composition>",
      "estimatedDurationS": <number 6–10>
    }
  ]
}

SCENE SPLITTING LOGIC
- New scene when emotional tone changes
- New scene when location or visual context changes
- New scene when action changes
- Never exceed ~${MAX_SCENE_S} seconds per scene (at 2.2 words/second)
- Never create scenes shorter than ~${MIN_SCENE_S} seconds
- Prefer 3–${MAX_SCENES} scenes depending on script length

VISUAL PROMPT FORMAT
"cinematic [shotType] of {subject}, {environment}, {action}, {lighting}, ultra-detailed, film still, depth of field"

HARD CONSTRAINTS
- MAX ${MAX_SCENES} scenes
- NO duplicated meaning across scenes
- NO filler scenes
- MUST preserve full script intent
- If script is unclear: infer simplest coherent interpretation; do NOT ask questions

OUTPUT RULE: Return ONLY JSON. No commentary. No markdown. No explanation.`;

// ── LLM Director ───────────────────────────────────────────────────────────────

async function planScenesLLM(script: string): Promise<SceneSpec[] | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system:     DIRECTOR_CORE_SYSTEM,
      messages:   [{ role: "user", content: script }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : null;
    if (!text) return null;

    const parsed = JSON.parse(text.trim()) as { scenes: Omit<SceneSpec, "index">[] };
    if (!Array.isArray(parsed.scenes) || !parsed.scenes.length) return null;

    return parsed.scenes
      .slice(0, MAX_SCENES)
      .map((s, i) => ({
        ...s,
        index:              i,
        estimatedDurationS: Math.max(MIN_SCENE_S, Math.min(MAX_SCENE_S, s.estimatedDurationS ?? 8)),
        visualPrompt:       s.visualPrompt || DEFAULT_VISUAL_PROMPT,
        shotType:           s.shotType     || "medium",
        emotion:            s.emotion      || "neutral",
        motion:             s.motion       || "static",
      }));
  } catch {
    return null;
  }
}

// ── Deterministic fallback ─────────────────────────────────────────────────────

export function planScenesDeterministic(script: string): SceneSpec[] {
  const rawSentences = script.match(/[^.!?]*[.!?]+\s*/g)?.map(s => s.trim()).filter(Boolean);
  const sentences    = rawSentences?.length ? rawSentences : [script.trim()];

  const scenes: SceneSpec[]     = [];
  let current                   = "";
  let wordCount                 = 0;

  const flush = () => {
    if (!current.trim()) return;
    const dur = Math.max(MIN_SCENE_S, Math.min(MAX_SCENE_S, wordCount / WPS));
    scenes.push({
      index:              scenes.length,
      text:               current.trim(),
      visualPrompt:       DEFAULT_VISUAL_PROMPT,
      shotType:           "medium",
      emotion:            "neutral",
      motion:             "static",
      estimatedDurationS: dur,
    });
    current   = "";
    wordCount = 0;
  };

  for (const sentence of sentences) {
    const sentenceWords = sentence.split(/\s+/).filter(Boolean).length;
    const projected     = (wordCount + sentenceWords) / WPS;

    if (scenes.length < MAX_SCENES - 1 && wordCount > 0 && projected > MAX_SCENE_S) {
      flush();
    }

    current    += (current ? " " : "") + sentence;
    wordCount  += sentenceWords;
  }
  flush();

  // Pad to at least 1 scene
  if (!scenes.length) {
    scenes.push({
      index:              0,
      text:               script.trim(),
      visualPrompt:       DEFAULT_VISUAL_PROMPT,
      shotType:           "medium",
      emotion:            "neutral",
      motion:             "static",
      estimatedDurationS: Math.max(MIN_SCENE_S, Math.min(MAX_SCENE_S, script.split(/\s+/).length / WPS)),
    });
  }

  return scenes;
}

// ── Public entry point ─────────────────────────────────────────────────────────

/**
 * Plan scenes for a script.
 * Attempts LLM Director first (requires ANTHROPIC_API_KEY);
 * falls back to deterministic planner on failure or missing key.
 */
export async function planScenes(script: string): Promise<SceneSpec[]> {
  const llmResult = await planScenesLLM(script);
  if (llmResult) {
    console.log(`[scene-planner] LLM Director: scenes=${llmResult.length}`);
    return llmResult;
  }
  const detResult = planScenesDeterministic(script);
  console.log(`[scene-planner] deterministic fallback: scenes=${detResult.length}`);
  return detResult;
}
