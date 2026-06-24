/**
 * POST /api/generate-scripts
 *
 * Takes a user idea and returns 5 script options.
 * Each script has:
 *   - title:        Short label shown in the picker
 *   - hook:         Opening sentence
 *   - narration:    ONLY the spoken words (70-80 words) — sent to ElevenLabs
 *   - scenePrompts: 3 Runway Gen-4 ready prompts (one per 10s scene)
 *
 * Body:    { idea: string, niche?: string }
 * Returns: { scripts: ScriptOption[] }
 */

import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export interface ScriptOption {
  id:           string;
  title:        string;
  hook:         string;
  narration:    string;   // spoken only — goes to ElevenLabs
  scenePrompts: [string, string, string]; // 3 Runway prompts
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let idea: string;
  let niche: string | undefined;
  try {
    const body = await req.json();
    idea  = (body.idea  ?? "").trim();
    niche = (body.niche ?? "").trim() || undefined;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!idea) return Response.json({ error: "idea is required" }, { status: 400 });

  const systemPrompt = `You are Omnyra, a cinematic short-form video scriptwriter.

GHOST TEST (NEVER BREAK):
Never write internal emotions ("she was furious", "he felt relieved").
Always translate emotion into physical, observable behavior ("her jaw tightened", "he set the phone face-down on the table and walked away").

Your job: given a user's idea, generate 5 distinct script options for a 30-second vertical video (9:16).
Each script must include:
1. A short title (4-6 words)
2. A hook (the first spoken sentence — grabs attention in under 3 seconds)
3. A narration: ONLY the words spoken aloud, 70-80 words. This goes directly to a text-to-speech engine. NO scene directions, NO [brackets], NO (parentheses), NO camera notes, NO formatting markup.
4. Exactly 3 Runway scene prompts, one per 10-second scene. Each prompt should be:
   - Photorealistic, cinematic, vertical 9:16
   - Specific about: subject appearance, action, camera movement, lighting, setting
   - 60-120 words
   - Consistent character across all 3 scenes (same person, same clothes, same lighting style)
   - Scene 1: establishing shot, scene begins
   - Scene 2: middle action or development
   - Scene 3: emotional resolution or CTA moment

The 5 scripts should offer DIFFERENT creative angles: emotional, informational, aspirational, story-driven, and surprising.`;

  const userPrompt = `User idea: "${idea}"${niche ? `\nNiche: ${niche}` : ""}

Return a JSON object exactly like this (no markdown fences, just raw JSON):
{
  "scripts": [
    {
      "title": "Short title here",
      "hook": "Opening line that hooks immediately",
      "narration": "Full 70-80 word spoken narration here. Only spoken words. No directions.",
      "scenePrompts": [
        "Scene 1 Runway prompt (60-120 words, photorealistic vertical 9:16)...",
        "Scene 2 Runway prompt (60-120 words, same character, same lighting)...",
        "Scene 3 Runway prompt (60-120 words, emotional resolution)..."
      ]
    }
  ]
}

Generate exactly 5 scripts with different creative angles.`;

  try {
    const msg = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      system:     systemPrompt,
      messages:   [{ role: "user", content: userPrompt }],
    });

    const rawText = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    let raw = rawText.replace(/```json|```/g, "").trim();
    const start = raw.indexOf("{");
    const end   = raw.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON in response");
    raw = raw.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");

    const parsed = JSON.parse(raw) as { scripts?: unknown[] };
    const rawScripts = Array.isArray(parsed.scripts) ? parsed.scripts : [];

    const scripts: ScriptOption[] = rawScripts
      .slice(0, 5)
      .map((s: unknown, i: number) => {
        const sc = s as Record<string, unknown>;
        const scenes = Array.isArray(sc.scenePrompts) ? sc.scenePrompts : [];
        return {
          id:           `script-${i}`,
          title:        String(sc.title ?? `Option ${i + 1}`),
          hook:         String(sc.hook  ?? ""),
          narration:    String(sc.narration ?? ""),
          scenePrompts: [
            String(scenes[0] ?? ""),
            String(scenes[1] ?? ""),
            String(scenes[2] ?? ""),
          ] as [string, string, string],
        };
      })
      .filter(s => s.narration.length > 20);

    if (!scripts.length) throw new Error("No valid scripts generated");

    return Response.json({ scripts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-scripts] error:", msg);
    return Response.json({ error: `Script generation failed: ${msg}` }, { status: 500 });
  }
}
