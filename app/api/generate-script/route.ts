import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: "server_misconfiguration", message: "OPENAI_API_KEY missing" },
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

  const prompt = `You are an expert scriptwriter for short-form social content.

Expand this content brief into a full ready-to-record script.

Hook: ${hookText}
Core Script: ${scriptText}
CTA: ${ctaText}
Template: ${templateText}
Niche: ${nicheText}
Target Audience: ${audienceText}
Platforms: ${platformText}

Write a complete natural-sounding script:
- Start immediately with the hook — no preamble
- Add [PAUSE] markers where the creator should pause for effect
- Use **bold** for emphasis words
- Add [SCENE: description] for visual direction
- Platform-optimised length — 60-90 seconds for TikTok/Reels
- Conversational, not corporate
- End with the CTA naturally woven in

Return only the script. No explanation. No title. Just the script.`;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const openaiStream = await client.chat.completions.create({
          model:      "gpt-4o",
          max_tokens: 1500,
          stream:     true,
          messages:   [{ role: "user", content: prompt }],
        });

        for await (const chunk of openaiStream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            controller.enqueue(encoder.encode(delta));
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
