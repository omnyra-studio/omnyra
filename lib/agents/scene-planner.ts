/**
 * Scene Planner Agent — Agent 2 of 5.
 *
 * Input:  Director output + script
 * Output: Scene breakdown with timing, transitions, continuity chain
 *
 * Rules:
 * - Enforce continuity chain (each scene anchors to previous)
 * - Assign duration based on emotional weight
 * - Define transitions explicitly
 * - Never generate render prompts
 */

import Anthropic from "@anthropic-ai/sdk";
import type { DirectorOutput } from "./director";

export interface PlannedScene {
  scene_id:        string;   // "scene_01"
  narrative_role:  "hook" | "development" | "climax" | "resolution";
  duration_secs:   number;
  script_portion:  string;   // which part of script this covers
  emotional_beat:  string;   // e.g. "doubt shifts to determination"
  transition_in:   "cut" | "dissolve" | "match-cut" | "first_frame_lock";
  transition_out:  "cut" | "dissolve" | "fade" | "hold";
  continues_from_previous: boolean;
  priority:        number;   // 1=high, 3=low — used by queue cost router
}

export interface ScenePlannerOutput {
  scenes:      PlannedScene[];
  total_secs:  number;
  story_arc:   string;
}

export async function runScenePlannerAgent(
  script: string,
  director: DirectorOutput,
  sceneCount: number,
): Promise<ScenePlannerOutput> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const res = await client.messages.create({
    model:      "claude-haiku-4-5-20251001",
    max_tokens: 800,
    system: `You are a Scene Planner AI. You break stories into structured scenes.

You receive the Director's film intent and a script.
You output a precise scene breakdown. NEVER write video prompts.

RULES:
- Exactly ${sceneCount} scenes
- Scene durations: hook=10s, development=10s, climax=10s, resolution=10s (adjust ±2s for emphasis)
- scenes[0].continues_from_previous MUST be false
- scenes[1+].continues_from_previous MUST be true
- scenes[1+].transition_in MUST be "first_frame_lock"
- Priority: climax=1 (render first), hook=2, development=2, resolution=3
- Each scene covers a DIFFERENT portion of the script

OUTPUT: valid JSON only. No markdown.`,
    messages: [{
      role:    "user",
      content: `Script: ${script.trim().slice(0, 800)}

Director's intent:
- Tone: ${director.tone}
- Arc: ${director.emotional_arc}
- Act 1: ${director.narrative_structure.act_1}
- Act 2: ${director.narrative_structure.act_2}
- Act 3: ${director.narrative_structure.act_3}
- Pacing: ${director.pacing}

Break this into exactly ${sceneCount} scenes.`,
    }],
  });

  const raw   = res.content[0]?.type === "text" ? res.content[0].text : "";
  const start = raw.indexOf("{");
  const end   = raw.lastIndexOf("}");

  try {
    return JSON.parse(raw.slice(start, end + 1)) as ScenePlannerOutput;
  } catch {
    const roles: PlannedScene["narrative_role"][] = ["hook", "development", "climax", "resolution"];
    return {
      story_arc:  director.emotional_arc,
      total_secs: sceneCount * 10,
      scenes: Array.from({ length: sceneCount }, (_, i) => ({
        scene_id:                `scene_0${i + 1}`,
        narrative_role:          roles[i % 4],
        duration_secs:           10,
        script_portion:          `Part ${i + 1} of ${sceneCount}`,
        emotional_beat:          director.emotional_arc.split("→")[i] ?? "neutral",
        transition_in:           i === 0 ? "cut" : "first_frame_lock",
        transition_out:          i === sceneCount - 1 ? "fade" : "cut",
        continues_from_previous: i > 0,
        priority:                roles[i % 4] === "climax" ? 1 : 2,
      })),
    };
  }
}
