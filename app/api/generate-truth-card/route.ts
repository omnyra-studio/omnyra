/**
 * POST /api/generate-truth-card
 *
 * Generates a single Ghost-Test-compliant "Truth Card" line (max 12 words)
 * that captures the emotional truth of a concept through visible behavior —
 * never by naming the emotion directly.
 *
 * Body:    { script, concept?, hook?, targetAudience? }
 * Returns: { truth_card: string | null, reasoning: string }
 * Cost:    free (text generation)
 */

import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const GHOST_TEST = `GHOST TEST RULE (NEVER BREAK):
You are a ghost. You can only observe and describe what is physically visible or audible.
- Never name internal emotions (furious, guilty, heartbroken, relieved, excited, sad, happy, etc.).
- The Truth Card must be behavioral or subtextual: something a real person would say aloud in this moment, or a visible action that implies the emotional truth without stating it.
- Examples of what PASSES:
  - "She set the fork down and just stared at the plate."
  - "He stood at the door for a full minute before he came in."
  - "Some things you only understand after you stop pretending."
- Examples of what FAILS:
  - "She was devastated."
  - "He finally found peace."`;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { script?: string; concept?: string; hook?: string; targetAudience?: string };
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { script, concept, hook, targetAudience } = body;
  if (!script?.trim()) return Response.json({ error: "script is required" }, { status: 400 });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: `You are a world-class copywriter specialising in emotionally resonant short-form video ads.

${GHOST_TEST}

Task: Create ONE Truth Card line (max 12 words) that captures the emotional core of this script WITHOUT naming any emotion. The line must:
- Feel authentic and specific to this script — not generic or motivational-poster.
- Connect directly to the product or service being shown.
- Match the tone of the concept (intimate, relatable, premium, rebellious, etc.).
- Be something a real character in this story could say, or a behavioral observation that implies the truth.

If no strong subtextual line fits naturally, return exactly: NO_TRUTH_CARD_NEEDED

Return ONLY valid JSON — no markdown, no backticks:
{
  "truth_card": "the line — or NO_TRUTH_CARD_NEEDED",
  "reasoning": "one sentence: what visible behavior or moment this line evokes"
}`,
      messages: [{
        role: "user",
        content: `Concept: ${concept ?? "(not provided)"}
Hook: ${hook ?? "(not provided)"}
Target Audience: ${targetAudience ?? "general audience"}

Script:
${script.trim()}`,
      }],
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text : "{}";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("Claude returned invalid JSON for truth card");

    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      truth_card: string;
      reasoning: string;
    };

    return Response.json({
      truth_card: parsed.truth_card === "NO_TRUTH_CARD_NEEDED" ? null : parsed.truth_card,
      reasoning: parsed.reasoning ?? "",
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-truth-card]", msg);
    return Response.json({ error: "Truth card generation failed" }, { status: 500 });
  }
}
