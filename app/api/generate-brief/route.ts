import Anthropic from "@anthropic-ai/sdk";
import { withTrace } from "@/lib/api/autopsy";

async function handler(req: Request): Promise<Response> {
  // ── Pre-flight: env guard ────────────────────────────────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[generate-brief FATAL] ANTHROPIC_API_KEY is not set");
    return Response.json(
      { error: "server_misconfiguration", message: "ANTHROPIC_API_KEY missing" },
      { status: 500 },
    );
  }

  // ── Request parsing ──────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (err: unknown) {
    console.error("[generate-brief FATAL] Failed to parse request body:", err);
    return Response.json(
      { error: "invalid_request", message: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const { goal, template, niche, targetAudience, platforms } = body as {
    goal?: string;
    template?: string;
    niche?: string;
    targetAudience?: string;
    platforms?: string[];
  };

  if (!goal || typeof goal !== "string" || !goal.trim()) {
    return Response.json(
      { error: "invalid_request", message: "Field 'goal' is required" },
      { status: 400 },
    );
  }

  // ── Build prompt ─────────────────────────────────────────────────────────────
  const prompt = `You are a TikTok content strategist. Generate exactly 5 content versions.

Goal: ${goal}
Template: ${template || "ugc-ad"}
Niche: ${niche || "general"}
Target Audience: ${targetAudience || "general"}
Platforms: ${platforms?.join(", ") || "TikTok"}

Return ONLY a JSON object. No markdown, no backticks, no explanation.
Exactly this structure:

{
  "versions": [
    {
      "title": "Short version title",
      "hook": "Opening line that stops the scroll",
      "script": "Full script 150-200 words max",
      "cta": "Call to action",
      "viral_score": 78,
      "hook_strength": "Strong",
      "best_post_time": "7pm-9pm Tuesday-Thursday",
      "estimated_reach": "10K-50K views"
    }
  ]
}

Rules:
- Exactly 5 versions in the array, each with a genuinely different angle
- viral_score is an integer 60-95
- hook_strength is exactly one of: Moderate, Strong, Explosive
- Scripts under 200 words, written for spoken delivery
- Return pure JSON only`;

  // ── Streaming response ───────────────────────────────────────────────────────
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropicStream = client.messages.stream({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2000,
          messages: [{ role: "user", content: prompt }],
        });

        for await (const chunk of anthropicStream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
        controller.close();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[generate-brief FATAL] Anthropic stream error:", message);
        // Encode error as JSON so the client always gets parseable data
        controller.enqueue(
          encoder.encode(JSON.stringify({ error: "stream_failure", message })),
        );
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

export const POST = withTrace(handler);
