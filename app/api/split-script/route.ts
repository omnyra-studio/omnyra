import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getBrandProfile, getBrandSystemPrompt } from "@/lib/brand";
import { logUsageEvent } from "@/lib/cache";

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY missing" }, { status: 500 });
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

For each segment create a cinematic image-to-video prompt and classify the scene type.

SCENE TYPE RULES:
- talking_head: presenter speaking directly to camera
- lifestyle_broll: dynamic lifestyle footage, environments, people in action
- product_demo: product being shown or demonstrated
- emotional: high-impact emotional moment, dramatic
- quote: text overlay, inspirational message, statistic
- educational: explanation, diagram, concept visualization
- cta: call-to-action, subscribe/follow prompt
- background: ambient backdrop, establishing shot
- transition: scene transition, time lapse

ROUTING (use this to assign provider):
- talking_head, lifestyle_broll, product_demo, emotional → "kling"
- quote, educational, cta, background, transition → "smart_motion"

For each segment:
- visual_prompt: 15-20 word cinematic scene description with camera movement, lighting, mood
- scene_type: one of the types above
- provider: "kling" or "smart_motion"

Return ONLY valid JSON. No markdown, no backticks:
{
  "segments": [
    { "text": "script portion", "visual_prompt": "cinematic scene prompt", "scene_type": "lifestyle_broll", "provider": "kling" }
  ]
}`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const response = await client.messages.create({
      model:     "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system:    brandContext ? `You are a cinematic scriptwriter.${brandContext}` : "You are a cinematic scriptwriter.",
      messages:  [{ role: "user", content: prompt }],
    });

    const text   = response.content[0]?.type === "text" ? response.content[0].text : "{}";
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
