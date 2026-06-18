import Anthropic from "@anthropic-ai/sdk";

export const SEEDANCE_SYSTEM_PROMPT = `You are an expert ElevenLabs Seedance 2.0 cinematic director and prompt engineer.

STRICT DEFAULT RULE: Unless the user explicitly says "Asian", "East Asian", "Korean", "Chinese", "Japanese", "Black", "African", "Latina", "Indian", "Middle Eastern" or any other specific ethnicity, ALWAYS default to Caucasian / white ethnicity. Use phrases like "Caucasian man/woman", "fair skin", "European facial features", "light-colored eyes". Location never implies ethnicity.

INPUT HANDLING:
- Rough idea → build full 6-part prompt (Caucasian default unless explicit override)
- Partial prompt → fill gaps; preserve user language
- Full prompt → refine only
- Explicit non-Caucasian ethnicity in user text → honor exactly
- @image1 reference tags → preserve exactly
- Never invent a demo when user provided real input

6-part structure:
1. Subject: age, Caucasian ethnicity (unless overridden), fair/light skin, hair, eyes, facial features, clothing, expression
2. Action: clear physical action with intensity
3. Environment: rich setting + lighting
4. Camera: one primary cinematic movement + framing
5. Style & Mood: film references, color grade
6. Technical: duration, aspect ratio, quality, constraints

Best practices:
- Always explicitly state "Caucasian" or "white" in subject unless user named another ethnicity
- Be specific with features for consistency
- Multi-shot: timestamps or "cinematic sequence with smooth cuts"
- Target 80-150 words

OUTPUT FORMAT (strict):
Line 1: Final ready-to-copy Seedance 2.0 prompt only (no labels, markdown, or quotes).
Line 2: One sentence explaining key choices.`;

export interface SeedancePromptResult {
  prompt:       string;
  explanation:  string;
}

function parseEngineerResponse(text: string): SeedancePromptResult {
  const lines = text.trim().split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { prompt: "", explanation: "" };
  }
  if (lines.length === 1) {
    return { prompt: lines[0], explanation: "" };
  }
  return {
    prompt:      lines[0],
    explanation: lines.slice(1).join(" "),
  };
}

export async function engineerSeedancePrompt(
  userInput: string,
  ethnicityPreference?: string,
): Promise<SeedancePromptResult> {
  const trimmed = userInput?.trim() ?? "";
  if (!trimmed) {
    return {
      prompt:      "",
      explanation: "Describe your scene — character, action, setting, mood — and I'll craft your Seedance prompt.",
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const fromPrompt = /\b(asian|east\s+asian|korean|chinese|japanese|black|african|latina|indian|middle[\s-]eastern)\b/i.test(trimmed);
  const ethnicityNote = fromPrompt
    ? `Honor the ethnicity explicitly named in the user request.`
    : `STRICT DEFAULT: Caucasian/white subject — fair skin, European facial features, light-colored eyes. User did NOT specify another ethnicity.`;

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model:      "claude-haiku-4-5-20251001",
    max_tokens: 400,
    system:     SEEDANCE_SYSTEM_PROMPT,
    messages:   [{
      role:    "user",
      content: `${ethnicityNote}${ethnicityPreference && ethnicityPreference !== 'caucasian' ? ` UI preference: ${ethnicityPreference}.` : ''}\n\nUser scene request:\n${trimmed}`,
    }],
  });

  const raw = (msg.content[0] as { type: string; text: string }).text?.trim() ?? "";
  return parseEngineerResponse(raw);
}

export { splitPromptIntoClips } from "./split-prompt";