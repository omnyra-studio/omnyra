import OpenAI from "openai";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getBrandProfile, getBrandSystemPrompt } from "@/lib/brand";
import { checkCache, saveCache, logUsageEvent } from "@/lib/cache";

export async function POST(req: Request) {
  const { goal, template, niche, targetAudience, platforms } = await req.json();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "OpenAI API key missing" }, { status: 500 });
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

  const client = new OpenAI({ apiKey });

  const prompt = `Generate 5 TikTok content versions as JSON.${brandContext}
Goal: ${goal}
Niche: ${niche || "general"}
Audience: ${targetAudience || "general"}
Platforms: ${Array.isArray(platforms) ? platforms.join(", ") : "TikTok"}

Return ONLY valid JSON starting with { and ending with }:
{"versions":[{"title":"","hook":"","script":"","cta":"","viral_score":75,"hook_strength":"Strong","best_post_time":"7pm-9pm Tue-Thu","estimated_reach":"10K-50K views"},{"title":"","hook":"","script":"","cta":"","viral_score":80,"hook_strength":"Explosive","best_post_time":"6pm-8pm Mon-Wed","estimated_reach":"20K-80K views"},{"title":"","hook":"","script":"","cta":"","viral_score":72,"hook_strength":"Moderate","best_post_time":"8pm-10pm Wed-Fri","estimated_reach":"8K-30K views"},{"title":"","hook":"","script":"","cta":"","viral_score":85,"hook_strength":"Explosive","best_post_time":"7pm-9pm Thu-Sat","estimated_reach":"30K-100K views"},{"title":"","hook":"","script":"","cta":"","viral_score":78,"hook_strength":"Strong","best_post_time":"6pm-9pm Tue-Fri","estimated_reach":"15K-60K views"}]}
Fill all empty strings. Scripts max 100 words each. Align ALL content to any brand identity above.`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1500,
      messages: [
        ...(brandContext ? [{ role: "system" as const, content: `You are a brand-aligned content strategist.${brandContext}` }] : []),
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const text = response.choices[0].message.content || "";
    const parsed = JSON.parse(text);

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
