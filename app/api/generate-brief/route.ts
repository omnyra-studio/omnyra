import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cleanEnv } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { withTrace } from "@/lib/api/autopsy";
import { getBrandProfile, getBrandSystemPrompt } from "@/lib/brand";
import { checkCache, saveCache, logUsageEvent } from "@/lib/cache";

export interface BriefData {
  situation_analysis: string;
  recommended_angle: string;
  hook_archetype: string;
  target_audience_emotional_state: string;
  structural_template: string;
  hook_options: string[];
  structural_recommendation: string;
  risk_assessment: string;
  predicted_performance: string;
}

async function handler(req: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[generate-brief FATAL] ANTHROPIC_API_KEY is not set");
    return Response.json(
      { error: "server_misconfiguration", message: "ANTHROPIC_API_KEY missing" },
      { status: 500 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (err: unknown) {
    console.error("[generate-brief] Failed to parse request body:", err);
    return Response.json(
      { error: "invalid_request", message: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const { goal, template, niche, targetAudience, platforms, projectId } = body as {
    goal?: string;
    template?: string;
    niche?: string;
    targetAudience?: string;
    platforms?: string[];
    projectId?: string;
  };

  if (!goal?.trim()) {
    return Response.json(
      { error: "invalid_request", message: "Field 'goal' is required" },
      { status: 400 },
    );
  }

  // Brand context + user identity
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

  // Cache check
  const cacheInput = JSON.stringify({ goal, template, niche, targetAudience, platforms });
  if (userId) {
    const cached = await checkCache(userId, "generate-brief", cacheInput);
    if (cached) {
      try {
        const briefData = JSON.parse(cached) as BriefData;
        return Response.json({ briefId: null, briefData, cached: true });
      } catch { /* parse failed — fall through to regenerate */ }
    }
  }

  const prompt = `You are a world-class short-form video content strategist. Produce a strategic creative brief for the following goal.${brandContext}

Goal: ${goal}
Template: ${template || "ugc-ad"}
Niche: ${niche || "general"}
Target Audience: ${targetAudience || "general"}
Platforms: ${platforms?.join(", ") || "TikTok, Instagram Reels"}

Return ONLY valid JSON. No markdown. No backticks. No explanation. Exactly this structure:

{
  "situation_analysis": "2-3 sentences: who the audience is, what emotional state they're in when encountering this content, and what psychological need this content fulfills",
  "recommended_angle": "The single strongest creative angle — specific, actionable, differentiated. State exactly what makes this angle win over generic alternatives.",
  "hook_archetype": "Exactly one of: Problem/Agitate/Solve | Before/After/Bridge | Story/Conflict/Resolution | Listicle/Countdown | Shock/Curiosity/Reveal | Direct Challenge | Social Proof",
  "target_audience_emotional_state": "Specific emotional state: e.g. 'Frustrated 25-34 year olds who have tried everything and feel stuck, seeking proof this is different'",
  "structural_template": "Exact timing breakdown: e.g. '0-3s: scroll-stopping hook → 3-12s: problem agitation → 12-40s: solution reveal with proof → 40-52s: transformation moment → 52-60s: soft CTA'",
  "hook_options": [
    "First 10 words that stop the scroll — angle 1",
    "First 10 words that stop the scroll — angle 2, pattern interrupt",
    "First 10 words — curiosity gap or bold claim",
    "First 10 words — transformation or social proof angle",
    "First 10 words — direct challenge or controversy"
  ],
  "structural_recommendation": "Shot-by-shot visual direction: what to film, what order, text overlays, b-roll style that works for this niche",
  "risk_assessment": "The single biggest risk with this content approach and the specific mitigation strategy",
  "predicted_performance": "Realistic forecast: view range in first 48h, typical engagement rate for this template, best posting day and time window"
}`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let briefData: BriefData;
  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1800,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON object in Anthropic response");
    briefData = JSON.parse(raw.slice(start, end + 1)) as BriefData;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-brief] Anthropic/parse error:", message);
    return Response.json({ error: "brief_generation_failed", message }, { status: 500 });
  }

  // Save to cache + log usage
  if (userId) {
    saveCache(userId, "generate-brief", cacheInput, JSON.stringify(briefData));
    logUsageEvent(userId, "generate-brief", "generate", 2, { template, niche });
  }

  // Persist to DB — non-blocking
  let briefId: string | null = null;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = createClient(
        cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
        cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
      );
      const { data, error } = await supabase
        .from("briefs")
        .insert({
          project_id: projectId ?? null,
          goal,
          template: template ?? "ugc-ad",
          niche: niche ?? null,
          situation_analysis: briefData.situation_analysis,
          recommended_angle: briefData.recommended_angle,
          hook_archetype: briefData.hook_archetype,
          target_audience_emotional_state: briefData.target_audience_emotional_state,
          structural_template: briefData.structural_template,
          hook_options: briefData.hook_options,
          structural_recommendation: briefData.structural_recommendation,
          risk_assessment: briefData.risk_assessment,
          predicted_performance: briefData.predicted_performance,
        })
        .select("id")
        .single();

      if (error) {
        console.warn("[generate-brief] DB save failed (returning inline data):", error.message);
      } else {
        briefId = (data as { id: string } | null)?.id ?? null;
      }
    } catch (err: unknown) {
      console.warn("[generate-brief] DB exception:", err instanceof Error ? err.message : String(err));
    }
  }

  return Response.json({ briefId, briefData });
}

export const POST = withTrace(handler);
