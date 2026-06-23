/**
 * Cinematography Agent — Agent 3 of 5.
 *
 * Input:  Planned scenes + Director tone
 * Output: Shot type, lens, camera movement, framing per scene
 *
 * Runs in PARALLEL with Emotion Engine (Agent 4).
 * Never writes story logic — only visual execution specs.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { PlannedScene } from "./scene-planner";
import type { DirectorOutput } from "./director";

export interface CinematographySpec {
  scene_id:    string;
  shot_type:   string;   // "medium tracking", "extreme close-up", "wide establishing"
  lens:        string;   // "35mm", "50mm", "85mm portrait", "24mm wide"
  movement:    string;   // "slow dolly right", "static", "handheld push-in"
  framing:     string;   // "rule of thirds left", "centered symmetrical"
  depth:       "shallow" | "medium" | "deep";
  motion_complexity: "low" | "medium" | "high";  // feeds cost router
}

const SHOT_MAP: Record<PlannedScene["narrative_role"], CinematographySpec> = {
  hook:        { scene_id: "", shot_type: "wide establishing",    lens: "24mm wide",      movement: "slow push-in",       framing: "rule of thirds",      depth: "deep",    motion_complexity: "medium" },
  development: { scene_id: "", shot_type: "medium tracking",      lens: "35mm",           movement: "smooth side track",  framing: "lead room",           depth: "medium",  motion_complexity: "medium" },
  climax:      { scene_id: "", shot_type: "medium close-up",      lens: "50mm",           movement: "slow dolly forward", framing: "centered emotional",  depth: "shallow", motion_complexity: "high"   },
  resolution:  { scene_id: "", shot_type: "wide emotional reveal", lens: "35mm",          movement: "slow pull-back",     framing: "symmetrical wide",    depth: "deep",    motion_complexity: "low"    },
};

export async function runCinematographyAgent(
  scenes: PlannedScene[],
  director: DirectorOutput,
): Promise<CinematographySpec[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const res = await client.messages.create({
    model:      "claude-haiku-4-5-20251001",
    max_tokens: 700,
    system: `You are a Cinematography AI. You define camera and shot specs for each scene.
You ONLY output technical camera specifications. You do NOT write story or prompts.

Tone from Director: ${director.tone}
Visual intent: ${director.visual_intent}
Pacing: ${director.pacing}

RULES:
- Each scene MUST have a different shot_type and different lens
- Climax scenes: shallow depth, high motion complexity, 50mm or 85mm
- Hook scenes: deep depth, wide lens, slow movement
- motion_complexity feeds the cost router (high = expensive model)

OUTPUT: valid JSON array only. No markdown.
[{ "scene_id": "scene_01", "shot_type": "...", "lens": "...", "movement": "...", "framing": "...", "depth": "shallow|medium|deep", "motion_complexity": "low|medium|high" }]`,
    messages: [{
      role:    "user",
      content: `Define cinematography specs for ${scenes.length} scenes:
${scenes.map(s => `${s.scene_id}: ${s.narrative_role} — ${s.emotional_beat}`).join("\n")}`,
    }],
  });

  const raw   = res.content[0]?.type === "text" ? res.content[0].text : "";
  const start = raw.indexOf("[");
  const end   = raw.lastIndexOf("]");

  try {
    return JSON.parse(raw.slice(start, end + 1)) as CinematographySpec[];
  } catch {
    // Fallback: use deterministic shot map
    return scenes.map(s => ({
      ...SHOT_MAP[s.narrative_role],
      scene_id: s.scene_id,
    }));
  }
}
