/**
 * POST /api/creative-director
 *
 * Omnyra AI Creative Director — enhances a raw concept + script using the
 * niche playbook and trend intelligence, then breaks it into 3 cinematic scenes
 * with motion direction for Kling.
 *
 * Body:    { concept, rawScript, niche }
 * Returns: { enhancedConcept, cleanScript, scenes, emotionalArc, retentionTips, trendingHook }
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";
import { getNicheSettings } from "@/lib/config/nicheSettings";
import { getTrendingHook, getTrendingTopics } from "@/lib/trends";

export const maxDuration = 30;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { concept?: string; rawScript?: string; niche?: string };
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { concept, rawScript, niche } = body;
  if (!concept?.trim()) return Response.json({ error: "concept is required" }, { status: 400 });

  const nicheSettings = getNicheSettings(niche);
  const playbook = nicheSettings.playbook;
  const trendingHook = getTrendingHook(nicheSettings.name);
  const trendingTopics = getTrendingTopics(nicheSettings.name, 3);

  const systemPrompt = `You are Omnyra's AI Creative Director.

Your job: take a user's concept and raw script, then enhance it for maximum retention and virality.

Niche: ${nicheSettings.name}
Niche Playbook:
- Pacing: ${playbook.pacing}
- Visual Style: ${playbook.visualStyle}
- Narration Tone: ${playbook.narrationTone}
- Key Elements: ${playbook.keyElements.join(", ")}
- Retention Hooks: ${playbook.retentionHooks.join(", ")}
- Recommended Length: ${playbook.recommendedLength}

Trending Hook for this niche: "${trendingHook}"
Trending Topics: ${trendingTopics.join(", ")}

Steps:
1. Apply the niche playbook rules strictly
2. Use the trending hook to sharpen the opening
3. Write a high-retention 25-30 second CLEAN narration script (no stage directions, no scene labels, pure spoken words only)
4. Break into exactly 3 scenes with timing and cinematic motion directions for Kling AI
5. Add retention techniques from the playbook

IMPORTANT RULES for cleanScript:
- Remove ALL stage directions like [SCENE 1], (voice over), [CUT TO], etc.
- Remove ALL ALL-CAPS direction lines
- Only include the actual spoken words
- Max 80 words

Output ONLY valid JSON. No markdown. No backticks. No explanation.
{
  "enhancedConcept": "one sentence improved concept",
  "cleanScript": "pure spoken narration only, max 80 words",
  "scenes": [
    {
      "time": "0-10s",
      "description": "what happens visually — be specific and cinematic",
      "motion": "director prose for Kling: camera move + character action"
    },
    {
      "time": "10-20s",
      "description": "...",
      "motion": "..."
    },
    {
      "time": "20-30s",
      "description": "...",
      "motion": "..."
    }
  ],
  "emotionalArc": "${nicheSettings.emotionalArc}",
  "retentionTips": ["tip1", "tip2", "tip3"]
}`;

  try {
    const result = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: `Concept: ${concept.trim()}\n\nRaw Script: ${(rawScript ?? concept).trim()}\n\nEnhance this for maximum retention and virality in the ${nicheSettings.name} niche.`,
      }],
    });

    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    const start = text.indexOf("{");
    const end   = text.lastIndexOf("}");
    if (start === -1 || end === -1) {
      console.error("[CREATIVE_DIRECTOR] no JSON in response:", text.substring(0, 200));
      return Response.json({ error: "Creative director returned no valid JSON" }, { status: 502 });
    }

    const enhanced = JSON.parse(text.slice(start, end + 1)) as {
      enhancedConcept: string;
      cleanScript: string;
      scenes: Array<{ time: string; description: string; motion: string }>;
      emotionalArc: string;
      retentionTips: string[];
    };

    console.log(`[CREATIVE_DIRECTOR] niche=${nicheSettings.key} hook="${trendingHook}" script_words=${enhanced.cleanScript?.split(" ").length ?? 0}`);

    return Response.json({
      success: true,
      enhanced,
      trendingHook,
      trendingTopics,
      niche: nicheSettings.key,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CREATIVE_DIRECTOR]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
