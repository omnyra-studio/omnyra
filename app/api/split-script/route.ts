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

  const systemPrompt = `You are Omnyra's Cinematic Motion Director.

Your job is NOT to write a screenplay. Your job is to create visual scene descriptions that generate compelling AI video.

RULE: Every scene MUST contain all three:
1. Human movement (walking, reaching, laughing, spinning, embracing — never just standing/watching/posing)
2. Environmental movement (waves, wind, rain, traffic, birds, trees, water, light changes)
3. Camera movement (tracking shot, push-in, orbit, slow dolly, handheld, crane, cinematic pan)

BAD: "A couple stands on the beach watching the sunset."
GOOD: "A couple walks barefoot along the shoreline at golden hour. Wind moves through their hair. Waves roll in. Camera tracks alongside them as the sun drops."

MOTION REQUIREMENTS per scene:
- Human motion ≥ 70 — visible physical action within first 2 seconds
- Environmental motion ≥ 60 — world is alive and moving
- Camera motion ≥ 60 — camera never locked off

EMOTIONAL ESCALATION across scenes:
Scene 1 → Curiosity
Scene 2 → Connection
Scene 3 → Emotion
Scene 4 → Payoff / Climax
Scene 5+ → Reflection → CTA

If any scene lacks visible movement, automatically rewrite it before returning.${brandContext}`;

  const prompt = `Split this script into exactly ${num_segments} visual scene segments optimised for AI video generation (Kling, Runway, Veo).

Script: ${script}
Hook: ${hook ?? ""}
Niche: ${niche ?? "general"}

SCENE TYPE CLASSIFICATION:
- talking_head: presenter speaking directly to camera with natural head/body movement
- lifestyle_broll: people in motion — walking, laughing, dancing, playing, working
- product_demo: product being used, handled, demonstrated with movement
- emotional: high-impact moment — embrace, reaction, tears, celebration
- quote: inspirational text with dynamic background movement
- educational: concept visualised with motion — diagrams, demonstrations
- cta: call-to-action with energetic motion background
- background: atmospheric environment — waves, cityscape, nature with movement
- transition: motion blur, time-lapse, visual transition

ROUTING:
- talking_head, lifestyle_broll, product_demo, emotional → "kling" (premium AI motion)
- quote, educational, cta, background, transition → "smart_motion" (lightweight cinematic)

For each segment output:
- text: the exact script words for this scene
- visual_prompt: 20-30 words describing the scene with SPECIFIC human action + environmental action + camera movement
- scene_type: one type from above
- provider: "kling" or "smart_motion"
- motion_score: estimated 0-100 motion intensity

Return ONLY valid JSON. No markdown, no backticks:
{
  "segments": [
    {
      "text": "script portion",
      "visual_prompt": "20-30 word motion-rich cinematic description",
      "scene_type": "lifestyle_broll",
      "provider": "kling",
      "motion_score": 85
    }
  ]
}`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const response = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system:     systemPrompt,
      messages:   [{ role: "user", content: prompt }],
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
