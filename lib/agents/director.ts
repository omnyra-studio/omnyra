/**
 * Director Agent — Agent 1 of 5 in the Omnyra Agent Swarm.
 *
 * Role: High-level film vision. Defines tone, emotional arc, and narrative
 *       structure. Does NOT generate prompts — only intent.
 *
 * Rule: Output is consumed by Scene Planner. Never touches render layer.
 */

import Anthropic from "@anthropic-ai/sdk";

export interface DirectorOutput {
  tone:           string;    // "gritty and emotional", "aspirational cinematic"
  emotional_arc:  string;    // "isolation → trust → connection"
  narrative_structure: {
    act_1: string;           // hook description
    act_2: string;           // development description
    act_3: string;           // resolution description
  };
  visual_intent:  string;    // overall visual feel
  pacing:         "slow" | "medium" | "fast" | "building";
  target_emotion: string;    // emotion the viewer should feel at end
}

export async function runDirectorAgent(
  script: string,
  concept: string,
  niche: string,
  hook?: string,
): Promise<DirectorOutput> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const res = await client.messages.create({
    model:      "claude-haiku-4-5-20251001",  // fast + cheap for single-purpose agents
    max_tokens: 600,
    system: `You are a Film Director AI. Your only job is to define creative film intent.
You NEVER write prompts, NEVER describe visuals in detail, NEVER instruct cameras.
You only define: tone, emotional arc, narrative structure, and pacing.
Think of yourself as pitching the film concept to a producer in 60 seconds.

OUTPUT: valid JSON only. No markdown.`,
    messages: [{
      role:    "user",
      content: `Script: ${script.trim().slice(0, 800)}
Concept: ${concept}
Niche: ${niche}${hook ? `\nHook: ${hook}` : ""}

Define the film intent for this video. What is the emotional journey? What should the viewer feel?`,
    }],
  });

  const raw   = res.content[0]?.type === "text" ? res.content[0].text : "";
  const start = raw.indexOf("{");
  const end   = raw.lastIndexOf("}");

  try {
    return JSON.parse(raw.slice(start, end + 1)) as DirectorOutput;
  } catch {
    // Graceful fallback — Director failure must never block render
    return {
      tone:           "cinematic and authentic",
      emotional_arc:  "challenge → effort → resolution",
      narrative_structure: {
        act_1: "Establish the struggle",
        act_2: "Show the turning point",
        act_3: "Deliver the payoff",
      },
      visual_intent:  "Cinematic realism, Roger Deakins natural lighting",
      pacing:         "building",
      target_emotion: "inspired",
    };
  }
}
