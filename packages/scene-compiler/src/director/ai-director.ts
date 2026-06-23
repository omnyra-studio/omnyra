import Anthropic from "@anthropic-ai/sdk";
import type { NarrativeRole } from "@omnyra/continuity-engine";
import { splitScriptIntoScenes, type SceneBreakdown } from "./story-breakdown";

export interface DirectorOutput {
  tone:               string;
  emotional_arc:      string;
  narrative_structure: { act_1: string; act_2: string; act_3: string };
  visual_intent:      string;
  pacing:             "slow-burn" | "steady" | "punchy" | "urgent";
  target_emotion:     string;
  scenes:             SceneBreakdown[];
}

/**
 * AI Director Agent — defines the film's intent.
 * NEVER writes prompts. ONLY defines tone, arc, pacing, and scene breakdown.
 */
export async function runDirectorAgent(
  script:     string,
  concept:    string,
  niche:      string,
  hook?:      string,
  apiKey?:    string,
): Promise<DirectorOutput> {
  const client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });

  try {
    const res = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: `You are a Film Director AI. You define the INTENT of a video — not the prompts.
Output a JSON DirectorOutput. Be concise. NEVER write render prompts.
{ "tone": string, "emotional_arc": "A→B→C→D", "narrative_structure": { "act_1": string, "act_2": string, "act_3": string }, "visual_intent": string, "pacing": "slow-burn|steady|punchy|urgent", "target_emotion": string }`,
      messages: [{
        role:    "user",
        content: `Script: ${script.trim().slice(0, 600)}\nConcept: ${concept}\nNiche: ${niche}${hook ? `\nHook: ${hook}` : ""}`,
      }],
    });

    const raw   = res.content[0]?.type === "text" ? res.content[0].text : "";
    const start = raw.indexOf("{");
    const end   = raw.lastIndexOf("}");
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Omit<DirectorOutput, "scenes">;

    const arcParts = (parsed.emotional_arc ?? "").split(/→|->/).map((s: string) => s.trim());
    const roles: NarrativeRole[] = ["hook", "development", "climax", "resolution"];
    const scenes = splitScriptIntoScenes(script, 4).map((s, i) => ({
      ...s,
      emotionalBeat: arcParts[i] ?? s.emotionalBeat,
    }));

    return { ...parsed, scenes };
  } catch {
    const roles: NarrativeRole[] = ["hook", "development", "climax", "resolution"];
    return {
      tone:               `authentic ${niche}`,
      emotional_arc:      "curious → engaged → moved → inspired",
      narrative_structure: { act_1: "establish context", act_2: "build tension", act_3: "deliver payoff" },
      visual_intent:      "cinematic realism, naturalistic, Roger Deakins golden hour",
      pacing:             "steady",
      target_emotion:     "inspired",
      scenes:             splitScriptIntoScenes(script, 4),
    };
  }
}
