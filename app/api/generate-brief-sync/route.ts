import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getBrandProfile, getBrandSystemPrompt } from "@/lib/brand";
import { checkCache, saveCache, logUsageEvent } from "@/lib/cache";
import { isScriptTooSimilar, storeScriptHistory } from "@/lib/memory/script-uniqueness";

// ── Silent Ghost Test: rewrite prompt to physical-action-only language ────────
async function ghostEnhance(apiKey: string, prompt: string): Promise<string> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system:
          "You are the Ghost Test enforcer for Omnyra. Rewrite the user's prompt to describe ONLY " +
          "observable physical actions, body language, micro-behaviours, object interactions, clothing, " +
          "props, environment, lighting, and camera angles. " +
          "Remove all emotion labels, internal states, and evaluative adjectives. " +
          "Return ONLY the rewritten prompt as plain text — no JSON, no explanation.",
        messages: [{ role: "user", content: `Rewrite to be Ghost Test compliant:\n\n${prompt}` }],
      }),
    });
    const data = await res.json() as { content?: Array<{ type: string; text: string }> };
    return data.content?.[0]?.text?.trim() || prompt;
  } catch {
    return prompt;
  }
}

// ── Silent Emotional Intelligence: detect arc + emotions ───────────────────────
interface EmotionData { arc: string; emotions: string[]; intensity: number }
async function detectEmotion(apiKey: string, prompt: string): Promise<EmotionData> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 150,
        system:
          "Detect the emotional arc of this content brief. " +
          'Return ONLY valid JSON: {"arc":"string","emotions":["string"],"intensity":1-10} ' +
          "Arc options: rising-tension, falling-tension, cathartic-release, melancholic-hope, " +
          "triumphant, neutral, comedic, dramatic, heartfelt-journey.",
        messages: [{ role: "user", content: `Detect emotional arc:\n\n${prompt}` }],
      }),
    });
    const data = await res.json() as { content?: Array<{ type: string; text: string }> };
    const raw = data.content?.[0]?.text ?? "";
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as EmotionData;
  } catch {}
  return { arc: "neutral", emotions: [], intensity: 5 };
}

export async function POST(req: Request) {
  const { goal, template, niche, targetAudience, platforms, isContinuation, lightningMode } = await req.json();

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

  // ── Silent pre-processing: Ghost Test + Emotional Intelligence in parallel ───
  const [enhancedGoal, emotion] = await Promise.all([
    ghostEnhance(apiKey, goal ?? ""),
    detectEmotion(apiKey, goal ?? ""),
  ]);

  // EI arc injection for system prompt
  const eiGuidance = emotion.arc !== "neutral"
    ? `\n\nEMOTIONAL ARC DETECTED: ${emotion.arc}. Key emotions: ${emotion.emotions.join(", ") || "unspecified"}. ` +
      `Intensity: ${emotion.intensity}/10. Translate these into observable physical actions only — ` +
      `show the arc through body language, micro-expressions, environment, and camera movement.`
    : "";

  // Detect emotional/relational content for arc-specific guidance
  const goalLower = (enhancedGoal ?? "").toLowerCase();
  const isEmotionalContent = /\b(sad|tear|cry|comfort|danc|beach|alone|silent|tender|hurt|pain|love|heartbreak|emot|vulnerab|broken|lonely|miss|griev|swaying|shore|relationship|couple|partner|together|silent|quiet)\b/.test(goalLower);

  const model = lightningMode ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6";

  const systemPrompt = `You are an elite cinematic script writer for short-form emotional storytelling video.${brandContext ? `\n\n${brandContext}` : ""}${eiGuidance}

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

Goal: ${enhancedGoal}
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
        model,
        max_tokens: lightningMode ? 1500 : 3000,
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

    // Semantic uniqueness check — skip for continuation/series mode
    let finalParsed = parsed;
    if (userId && !isContinuation) {
      const versions = parsed.versions as Array<{ script?: string; viral_score?: number }>;
      const bestScript = versions.reduce((a, b) => ((a.viral_score ?? 0) >= (b.viral_score ?? 0) ? a : b)).script ?? "";
      if (bestScript.length > 20) {
        const { tooSimilar, maxSimilarity } = await isScriptTooSimilar(bestScript, userId);
        if (tooSimilar) {
          console.info(`[SCRIPT_UNIQUENESS] maxSim=${maxSimilarity.toFixed(3)} — regenerating with diversity instruction`);
          const diversityPrompt = `${userPrompt}\n\nCRITICAL DIVERSITY REQUIREMENT: Your previous scripts were too similar to each other (similarity ${(maxSimilarity * 100).toFixed(0)}%). You MUST generate 5 completely different scripts this time. Use entirely different metaphors, structures, emotional entry points, and narrative styles. Do NOT reuse phrases or sentence patterns from previous outputs.`;
          const retryRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({ model, max_tokens: lightningMode ? 1500 : 3000, system: systemPrompt, messages: [{ role: "user", content: diversityPrompt }] }),
          });
          const retryData = await retryRes.json() as { content?: Array<{ type: string; text: string }> };
          const retryText = retryData.content?.[0]?.text ?? "";
          const rs = retryText.indexOf("{"), re = retryText.lastIndexOf("}");
          if (rs !== -1 && re !== -1) {
            const retryParsed = JSON.parse(retryText.slice(rs, re + 1)) as { versions?: unknown[] };
            if (retryParsed.versions?.length) {
              finalParsed = retryParsed;
              console.info("[SCRIPT_UNIQUENESS] retry succeeded — using diverse versions");
            }
          }
        } else {
          console.info(`[SCRIPT_UNIQUENESS] maxSim=${maxSimilarity.toFixed(3)} — unique enough, accepting`);
        }
      }

      // Store best script in history (non-blocking)
      const acceptedVersions = finalParsed.versions as Array<{ script?: string; viral_score?: number }>;
      const acceptedBest = acceptedVersions.reduce((a, b) => ((a.viral_score ?? 0) >= (b.viral_score ?? 0) ? a : b)).script ?? "";
      if (acceptedBest.length > 20) {
        storeScriptHistory(acceptedBest, userId, { goal: enhancedGoal, niche }).catch(() => {});
      }
    }

    if (userId) {
      saveCache(userId, "generate-brief-sync", cacheInput, JSON.stringify(finalParsed));
      logUsageEvent(userId, "generate-brief-sync", "generate", 2, { niche });
    }

    return Response.json(finalParsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("generate-brief-sync error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
