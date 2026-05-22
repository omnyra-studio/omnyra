/* Server-only script generation.
 * Wraps Anthropic + the prompt/scene engines so both /api/pipeline/draft
 * and /api/pipeline/render can share the same logic.
 */

import { buildMasterPrompt } from "./prompt-engine";
import { buildScenePrompts } from "./scene-engine";

export interface ScriptInput {
  product: string;
  audience: string;
  platform: string;
  goal: string;
  energy?: string | null;
  camera?: string | null;
  style?: string | null;
  duration: number;
}

export interface Scene {
  scene: number;
  duration: string;
  visual_prompt: string;
  emotion: string;
  motion: string;
  api: "kling" | "runway" | "pika";
}

export interface ScriptResult {
  script: string;
  scenes: Scene[];
}

type PromptPlatform = "tiktok" | "instagram" | "youtube";

function normalisePlatform(raw: string): PromptPlatform {
  const v = raw.toLowerCase();
  if (v.includes("instagram") || v.includes("reel")) return "instagram";
  if (v.includes("youtube") || v.includes("short")) return "youtube";
  return "tiktok";
}

export async function generateScriptAndScenes(
  input: ScriptInput,
): Promise<ScriptResult> {
  const energy = input.energy ?? "natural";
  const camera = input.camera ?? "ugc";
  const style = input.style ?? "founder";

  const normalizedPlatform = normalisePlatform(input.platform);

  const systemPrompt = buildMasterPrompt({
    product: input.product.trim(),
    audience: input.audience.trim(),
    platform: normalizedPlatform,
    goal: input.goal,
    energy,
    camera,
    style,
    duration: Number(input.duration),
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Write the ${input.duration}-second ${input.platform} script now. Output spoken words only.`,
        },
      ],
    }),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`anthropic: ${data.error.message ?? "unknown"}`);
  }

  const script: string = data.content?.[0]?.text ?? "";
  const scenes = buildScenePrompts(
    script,
    { energy, camera, style },
    Number(input.duration),
  ) as Scene[];

  return { script, scenes };
}
