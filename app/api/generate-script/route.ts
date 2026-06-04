import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getBrandProfile, getBrandSystemPrompt } from "@/lib/brand";
import { logUsageEvent } from "@/lib/cache";

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "server_misconfiguration", message: "ANTHROPIC_API_KEY missing" },
      { status: 500 },
    );
  }

  const {
    hook,
    script,
    cta,
    title,
    template,
    niche,
    targetAudience,
    platforms,
  } = await req.json();

  const hookText     = hook           || "Create engaging content";
  const scriptText   = script         || "";
  const ctaText      = cta            || "Follow for more";
  const templateText = template       || "ugc-ad";
  const nicheText    = niche          || "general";
  const audienceText = targetAudience || "general audience";
  const platformText = Array.isArray(platforms) ? platforms.join(", ") : "TikTok";

  // Brand context — graceful fallback if unauthenticated
  let brandSystemPrompt = "";
  let userId: string | null = null;
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      const brand = await getBrandProfile(user.id);
      brandSystemPrompt = getBrandSystemPrompt(brand);
    }
  } catch { /* brand injection is optional */ }

  const systemPrompt = `You are an expert scriptwriter for short-form social content.${brandSystemPrompt ? `\n\n${brandSystemPrompt}` : ""}`;

  const userPrompt = `Expand this content brief into a full ready-to-record script.

Hook: ${hookText}
Core Script: ${scriptText}
CTA: ${ctaText}
Template: ${templateText}
Niche: ${nicheText}
Target Audience: ${audienceText}
Platforms: ${platformText}

CRITICAL: This script will be read aloud by a text-to-speech engine.
Write ONLY the words to be spoken. Do NOT include:
- Stage directions: [pause], [breathe], [she breathes], [a tear rolls]
- Action descriptions in [brackets] or (parentheses)
- Emphasis markers: *word* or **word**
- Any annotation that is not a spoken word

Write a complete natural-sounding script:
- Start immediately with the hook — no preamble
- Use natural sentence rhythm for pauses — do not write [PAUSE]
- Platform-optimised length: MINIMUM 75 spoken words, target 80-100 words (= 30-40 seconds at natural pace)
- Conversational, not corporate
- End with the CTA naturally woven in

WORD COUNT REQUIREMENT: Your response must contain at least 75 spoken words.
At 2.5 words/second natural TTS pace: 75 words = 30 seconds, 150 words = 60 seconds.
Count your words before submitting. Do not write fewer than 75 words.

Return only the spoken script. No explanation. No title. Just the words.`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const encoder = new TextEncoder();

  if (userId) {
    logUsageEvent(userId, "generate-script", "generate", 1, { template: templateText, niche: nicheText });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropicStream = await client.messages.create({
          model:      "claude-haiku-4-5-20251001",
          max_tokens: 1500,
          stream:     true,
          system:     systemPrompt,
          messages:   [{ role: "user", content: userPrompt }],
        });

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[generate-script] stream error:", message);
        controller.enqueue(
          encoder.encode(`\n\n[Script generation failed: ${message}]`),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/plain; charset=utf-8",
      "Cache-Control":     "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
