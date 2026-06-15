/**
 * POST /api/generate-vo-script
 *
 * Rewrites a script into a natural, Ghost-Test-compliant voice-over script
 * optimised for ElevenLabs TTS. Streams the result.
 * Replaces emotion keywords with observable physical actions and delivery notes.
 *
 * Body:    { script, concept?, hook?, targetAudience?, tone? }
 * Returns: text/plain stream — Voice-Over Script + Estimated Duration + Tone Notes
 * Cost:    free (text generation)
 */

import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const GHOST_TEST = `GHOST TEST RULE (NEVER BREAK):
You are a ghost. You can only describe what you can see and hear — never internal thoughts or emotions.
- Remove all direct statements of emotion: "she was furious", "he felt relieved", "she was excited", etc.
- Replace them with physical actions, body language, and observable behavior that imply the feeling.
- Keep the emotional impact. Just make it visible and behavioral.
- Performance directions in [brackets] should describe delivery — not internal state.
  - GOOD: [voice tightens slightly], [long pause], [speaks more quietly], [quick breath before this line]
  - BAD: [sounds devastated], [feeling hopeful]`;

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

  let body: {
    script?: string;
    concept?: string;
    hook?: string;
    targetAudience?: string;
    tone?: string;
  };
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { script, concept, hook, targetAudience, tone } = body;
  if (!script?.trim()) return Response.json({ error: "script is required" }, { status: 400 });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropicStream = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1000,
          stream: true,
          system: `You are an expert voice director and script editor for high-converting short-form video ads. You are also a ghost — you rewrite scripts so they only contain what can be seen and heard.

${GHOST_TEST}

Task: Rewrite the provided script into a natural, high-impact voice-over script optimised for AI voice generation (ElevenLabs).

Rules:
- Keep the emotional arc and key messages. Translate all emotion words into observable actions and behavioral language.
- Make language conversational and easy to speak naturally — no corporate copy, no over-scripted phrasing.
- Add delivery directions in [brackets] that describe physical vocal behavior: [voice drops], [quick pause], [speaks faster now], [softer, almost to themselves], [long beat before continuing].
- Total spoken length: target 25–35 seconds (~65–90 words at natural pace). Count words before finishing.
- Remove any text meant for on-screen display only.
- Never output garbled or incomplete sentences.
- End with any CTA woven in naturally — not bolted on.

Output format (use these exact headers):
Voice-Over Script:
[the clean, speakable script with [performance notes]]

Estimated Duration: [X seconds]
Tone Notes: [2-3 sentences of voice model direction — describe the delivery physically, e.g. "measured pace with deliberate pauses, slight lowering of pitch mid-script, finishes with more energy"]`,
          messages: [{
            role: "user",
            content: `Original Script:
${script.trim()}

Concept: ${concept ?? "(not provided)"}
Hook: ${hook ?? "(not provided)"}
Target Audience: ${targetAudience ?? "general"}
Desired Tone: ${tone ?? "warm, authentic, conversational"}`,
          }],
        });

        for await (const event of anthropicStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[generate-vo-script] error:", msg);
        controller.enqueue(encoder.encode(`\n\n[Voice-over generation failed: ${msg}]`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
