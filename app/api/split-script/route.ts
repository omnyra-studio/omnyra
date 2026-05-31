import OpenAI from "openai";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getBrandProfile, getBrandSystemPrompt } from "@/lib/brand";
import { logUsageEvent } from "@/lib/cache";

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "OPENAI_API_KEY missing" }, { status: 500 });
  }

  const { script, hook, num_segments, niche } = await req.json();

  if (!script || !num_segments) {
    return Response.json({ error: "script and num_segments required" }, { status: 400 });
  }

  // Brand context — graceful fallback if unauthenticated
  let brandContext = "";
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
      brandContext = getBrandSystemPrompt(brand);
    }
  } catch { /* brand injection is optional */ }

  const prompt = `Split this script into exactly ${num_segments} visual scene segments for a cinematic video.${brandContext}

Script: ${script}
Hook: ${hook ?? ""}
Niche: ${niche ?? "general"}

For each segment create a cinematic image-to-video prompt that:
- Describes the visual scene matching that script moment
- Includes camera movement (slow push-in, dolly, drift, orbital)
- Includes lighting and mood
- Is 15-20 words max
- Flows naturally from the previous segment

Return ONLY valid JSON. No markdown, no backticks:
{
  "segments": [
    { "text": "script portion", "visual_prompt": "cinematic scene prompt" }
  ]
}`;

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1000,
      messages: [
        ...(brandContext ? [{ role: "system" as const, content: `You are a cinematic scriptwriter.${brandContext}` }] : []),
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const text = response.choices[0].message.content ?? "{}";
    const parsed = JSON.parse(text);

    if (!parsed.segments?.length) {
      return Response.json({ error: "No segments returned" }, { status: 500 });
    }

    if (userId) {
      logUsageEvent(userId, "split-script", "generate", 1, { num_segments, niche });
    }

    return Response.json(parsed);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[split-script] error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
