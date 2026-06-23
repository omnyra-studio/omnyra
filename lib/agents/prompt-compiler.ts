/**
 * Prompt Compiler Agent — Agent 5 of 5.
 *
 * Input:  All structured scene data from agents 1–4 + brand memory
 * Output: Final render prompts (image_prompt + video_prompt) per scene
 *
 * This is the ONLY agent that touches prompts.
 * Mandatory injections: brand memory, camera state, first-frame lock.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { PlannedScene } from "./scene-planner";
import type { CinematographySpec } from "./cinematography";
import type { EmotionBeat } from "./emotion-engine";
import type { DirectorOutput } from "./director";
import { buildBrandMemoryInjection, type BrandMemory } from "@/lib/memory/brand-memory";
import { buildEmotionContext } from "./emotion-engine";

export interface CompiledScenePrompts {
  scene_id:        string;
  image_prompt:    string;   // → Flux Dev
  video_prompt:    string;   // → Kling / Runway
  negative_prompt: string;
}

const NEGATIVE_BASE =
  "blur, low quality, text overlay, extra limbs, deformed anatomy, " +
  "particles from mouth, sand from face, liquid from eyes, glowing eyes, " +
  "supernatural effects, back of head, rear view, unstable motion";

export async function runPromptCompilerAgent(
  scene: PlannedScene,
  cinSpec: CinematographySpec,
  emotionBeat: EmotionBeat,
  director: DirectorOutput,
  brandMemory: BrandMemory | null,
  characterDescription: string,
  environmentContext: string,
): Promise<CompiledScenePrompts> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const brandBlock = brandMemory ? buildBrandMemoryInjection(brandMemory) : "";
  const emotionCtx = buildEmotionContext(emotionBeat);
  const continuityInstruction = scene.continues_from_previous
    ? "FIRST FRAME LOCK: Begin from exact final frame of previous scene. " +
      "Preserve pose, camera position, focal length for first 2 seconds. " +
      "No new motion until 2s elapsed. Then resume naturally."
    : "";

  const res = await client.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 400,
    system: `You are a Prompt Compiler AI. Your ONLY job is to write render prompts.
You receive fully structured scene data and output two prompts:
1. image_prompt: for Flux Dev (static reference image, 35–55 words)
2. video_prompt: for Kling/Runway (motion instructions, 25–40 words)

MANDATORY INJECTIONS — must appear in every prompt:
${brandBlock ? brandBlock : "- Cinematic realism, Roger Deakins lighting"}
${continuityInstruction}

RULES:
- Begin image_prompt with the shot type
- Begin video_prompt with "Continue from last frame:" if continues_from_previous
- Subject always faces camera — never back of head
- NEVER describe particles, smoke, sand, liquid from mouth/eyes/face
- NEVER describe supernatural effects

OUTPUT: valid JSON only. No markdown.
{ "image_prompt": "...", "video_prompt": "...", "negative_prompt": "..." }`,
    messages: [{
      role:    "user",
      content: `Scene: ${scene.scene_id} (${scene.narrative_role})
Script portion: ${scene.script_portion}
${emotionCtx}
Shot: ${cinSpec.shot_type}, ${cinSpec.lens}, ${cinSpec.movement}
Framing: ${cinSpec.framing}, depth: ${cinSpec.depth}
Character: ${characterDescription}
Environment: ${environmentContext}
Director tone: ${director.tone}, visual intent: ${director.visual_intent}

Write the image_prompt and video_prompt for this scene.`,
    }],
  });

  const raw   = res.content[0]?.type === "text" ? res.content[0].text : "";
  const start = raw.indexOf("{");
  const end   = raw.lastIndexOf("}");

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      image_prompt?: string;
      video_prompt?: string;
      negative_prompt?: string;
    };
    return {
      scene_id:        scene.scene_id,
      image_prompt:    parsed.image_prompt ?? `${cinSpec.shot_type} — ${characterDescription} in ${environmentContext}, ${emotionBeat.emotion}, ${director.visual_intent}, photorealistic cinematic`,
      video_prompt:    parsed.video_prompt ?? `${continuityInstruction} ${emotionCtx} ${cinSpec.movement} camera movement.`.slice(0, 400),
      negative_prompt: parsed.negative_prompt ?? NEGATIVE_BASE,
    };
  } catch {
    return {
      scene_id:        scene.scene_id,
      image_prompt:    `${cinSpec.shot_type} — ${characterDescription} in ${environmentContext}, ${emotionBeat.emotion}, ${director.visual_intent}, photorealistic cinematic`,
      video_prompt:    `${continuityInstruction} ${emotionCtx} ${cinSpec.movement}.`.slice(0, 400),
      negative_prompt: NEGATIVE_BASE,
    };
  }
}
