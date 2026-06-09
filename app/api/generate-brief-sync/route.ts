import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getBrandProfile, getBrandSystemPrompt } from "@/lib/brand";
import { checkCache, saveCache, logUsageEvent } from "@/lib/cache";

export async function POST(req: Request) {
  const { goal, template, niche, targetAudience, platforms } = await req.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Anthropic API key missing" }, { status: 500 });
  }

  // Brand context + cache
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

  const cacheInput = JSON.stringify({ goal, template, niche, targetAudience, platforms });
  if (userId) {
    const cached = await checkCache(userId, "generate-brief-sync", cacheInput);
    if (cached) {
      try {
        return Response.json({ ...JSON.parse(cached), cached: true });
      } catch { /* parse failed — regenerate */ }
    }
  }

  // Detect emotional/relational content so the prompt adds arc-specific guidance
  const goalLower = (goal ?? "").toLowerCase();
  const isEmotionalContent = /\b(sad|tear|cry|comfort|danc|beach|alone|silent|tender|hurt|pain|love|heartbreak|emot|vulnerab|broken|lonely|miss|griev|swaying|shore|relationship|couple|partner|together|silent|quiet)\b/.test(goalLower);

  const systemPrompt = `You are an elite cinematic script writer for short-form emotional storytelling video.${brandContext ? `\n\n${brandContext}` : ""}

CORE RULES — apply to every script option:
1. Every script must have a clear emotional arc. NOT just a flat happy moment. Show the JOURNEY: vulnerability/sadness → a turning point → comfort/resolution.
2. Include specific sensory and emotional details: tears on cheeks, silence, noticing pain, a tender action that says more than words.
3. Specify cinematic directions within the script: golden hour light, beach setting, rim lighting, close-up on tear, shallow depth of field.
4. Character orientation: ALWAYS describe people as FACING each other or FACING camera. NEVER describe a back-to-camera shot unless explicitly requested. If a man approaches a woman, write "he turns to face her" or "he steps in front of her."
5. Each script must be 80–110 words. Punchy, evocative, no filler.
6. End with a universal integrity/love truth — a line that makes the viewer stop scrolling.
7. Each of the 5 options must take a DIFFERENT angle, tone, or emotional entry point on the same core idea.

NEGATIVE PATTERNS — never write these:
- Generic happy couple from the start
- No emotional depth, no tears, no real moment
- Vague scene descriptions ("they walked on the beach")
- Man facing away or back to camera
- Smiling without earning it through the arc

Return ONLY valid JSON — no markdown, no prose, no backticks. The JSON must start with { and end with }.`;

  const emotionalArcGuidance = isEmotionalContent ? `
IMPORTANT — This brief contains emotional/relational content. Your 5 versions MUST each include:
- An opening beat of sadness, loneliness, or quiet pain (NOT starting with happiness)
- A specific silent or non-verbal act of comfort (not talking it through — SHOWING it)
- A visible emotional transition: tear → softening → gentle smile through remaining tears
- Correct character facing: if two people, they must face EACH OTHER, not away
- Cinematic framing: golden hour, rim light, close shot on face/hands/tears` : "";

  const userPrompt = `Generate 5 content versions for the following brief.

Goal: ${goal}
Niche: ${niche || "general"}
Audience: ${targetAudience || "general"}
Platforms: ${Array.isArray(platforms) ? platforms.join(", ") : "TikTok"}
${emotionalArcGuidance}

Each script must be 80–110 words with a full emotional arc and strong cinematic direction.
Each version must have a unique angle: e.g. different emotional entry points, different POVs, different pacing.

Return JSON in this exact shape (fill every empty string):
{"versions":[{"title":"","hook":"","script":"","cta":"","viral_score":75,"hook_strength":"Strong","best_post_time":"7pm-9pm Tue-Thu","estimated_reach":"10K-50K views"},{"title":"","hook":"","script":"","cta":"","viral_score":80,"hook_strength":"Explosive","best_post_time":"6pm-8pm Mon-Wed","estimated_reach":"20K-80K views"},{"title":"","hook":"","script":"","cta":"","viral_score":72,"hook_strength":"Moderate","best_post_time":"8pm-10pm Wed-Fri","estimated_reach":"8K-30K views"},{"title":"","hook":"","script":"","cta":"","viral_score":85,"hook_strength":"Explosive","best_post_time":"7pm-9pm Thu-Sat","estimated_reach":"30K-100K views"},{"title":"","hook":"","script":"","cta":"","viral_score":78,"hook_strength":"Strong","best_post_time":"6pm-9pm Tue-Fri","estimated_reach":"15K-60K views"}]}`;

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    const anthropicData = await anthropicRes.json() as {
      error?: { message: string };
      content?: Array<{ type: string; text: string }>;
    };

    if (anthropicData.error) {
      console.error("generate-brief-sync anthropic error:", anthropicData.error.message);
      return Response.json({ error: anthropicData.error.message }, { status: 500 });
    }

    const text = anthropicData.content?.[0]?.text ?? "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) {
      console.error("generate-brief-sync: no JSON in response:", text.substring(0, 200));
      return Response.json({ error: "No JSON in model response" }, { status: 500 });
    }

    const parsed = JSON.parse(text.slice(start, end + 1)) as { versions?: unknown[] };

    if (!parsed.versions?.length) {
      console.error("No versions in parsed response:", text.substring(0, 200));
      return Response.json({ error: "No versions returned" }, { status: 500 });
    }

    if (userId) {
      saveCache(userId, "generate-brief-sync", cacheInput, JSON.stringify(parsed));
      logUsageEvent(userId, "generate-brief-sync", "generate", 2, { niche });
    }

    return Response.json(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("generate-brief-sync error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
