/**
 * POST /api/generate-scripts
 *
 * Takes a user idea and returns 5 script options, each typed by optimization goal.
 *
 * Enhancements vs original:
 *   - scriptType tag: hook | emotional | viral | cinematic | experimental
 *   - retentionScore: heuristic 0–1 per type
 *   - trendScore: from trend_signals table (Apify data, non-blocking)
 *   - Trend context injected into generation prompt when signals exist
 *   - PostHog tracking: script_generated event
 *
 * Body:    { idea: string, niche?: string }
 * Returns: { scripts: ScriptOption[], trendScore: number }
 */

import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fetchTrendContext, computeTrendScore } from "@/lib/pipeline/trend-signals";
import { track, flushEvents } from "@/lib/analytics/posthog";

export type ScriptType = "hook" | "emotional" | "viral" | "cinematic" | "experimental";

export interface ScriptOption {
  id:             string;
  title:          string;
  hook:           string;
  narration:      string;          // spoken only — goes to ElevenLabs
  scenePrompts:   [string, string, string]; // 3 Runway prompts
  scriptType:     ScriptType;
  retentionScore: number;          // 0–1 heuristic — shown in picker as quality signal
  trendScore:     number;          // 0–1 from Apify trend signals for this niche
}

// Retention score by type — based on short-form engagement research
const RETENTION_BY_TYPE: Record<ScriptType, number> = {
  hook:         0.92,  // pattern-interrupt opening, highest first-3s retention
  emotional:    0.85,  // story arc, high completion rate
  viral:        0.80,  // fast pacing, high share rate but higher drop-off
  cinematic:    0.75,  // slower burn, premium feel
  experimental: 0.65,  // high variance — could outperform or underperform
};

// Script generation order — always in this exact sequence
const SCRIPT_TYPES: ScriptType[] = ["hook", "emotional", "viral", "cinematic", "experimental"];

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let idea: string;
  let niche: string | undefined;
  try {
    const body = await req.json();
    idea  = (body.idea  ?? "").trim();
    niche = (body.niche ?? "").trim() || undefined;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!idea) return Response.json({ error: "idea is required" }, { status: 400 });

  // Fetch trend signals for this niche — non-blocking, falls back to empty
  const trendCtx = await fetchTrendContext(niche ?? "general", 6);
  const trendScore = computeTrendScore(niche ?? "general", trendCtx.signals);

  const systemPrompt = `You are Omnyra, a cinematic short-form video scriptwriter and content strategist.

GHOST TEST (NEVER BREAK):
Never write internal emotions ("she was furious", "he felt relieved").
Always translate emotion into physical, observable behavior ("her jaw tightened", "he set the phone face-down on the table and walked away").

CONTENT RULES:
- Every scene = exactly 1 action, 1 emotion, 1 visual focus
- Hook must grab attention in under 3 seconds
- No compound actions ("walks and turns") — split into separate scenes
- No invented characters or props not in the story idea
- No stylistic adjectives: no "cinematic", "epic", "beautiful"

Your job: generate exactly 5 script variants in this order:
1. HOOK: Curiosity/shock opening. Maximizes first-3-second retention. Pattern interrupt.
2. EMOTIONAL: Story-driven arc. Physical emotional beats only. High completion rate.
3. VIRAL: Fast pacing, shareable moment, meme-ready format. Short punchy sentences.
4. CINEMATIC: Slower, premium feel. Visual-first. Each scene is a deliberate shot choice.
5. EXPERIMENTAL: High-risk angle. Unconventional format or structure. May outperform.`;

  const trendBlock = trendCtx.promptFragment
    ? `\n\n${trendCtx.promptFragment}`
    : "";

  const userPrompt = `User idea: "${idea}"${niche ? `\nNiche: ${niche}` : ""}${trendBlock}

Generate exactly 5 scripts in order: hook, emotional, viral, cinematic, experimental.

Return a JSON object (no markdown fences, raw JSON only):
{
  "scripts": [
    {
      "title": "4-6 word title",
      "hook": "First spoken sentence — grabs in under 3 seconds",
      "narration": "Full 70-80 word spoken narration. Only spoken words. No directions, no brackets, no parentheses.",
      "scenePrompts": [
        "Scene 1 (60-120 words): establishing shot, photorealistic, 9:16 vertical, specific subject + action + camera + lighting + setting...",
        "Scene 2 (60-120 words): same character, same clothes, same lighting style, development or escalation...",
        "Scene 3 (60-120 words): emotional resolution or clear call-to-action moment..."
      ]
    }
  ]
}`;

  try {
    const msg = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 5000,
      system:     systemPrompt,
      messages:   [{ role: "user", content: userPrompt }],
    });

    const rawText = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    let raw = rawText.replace(/```json|```/g, "").trim();
    const start = raw.indexOf("{");
    const end   = raw.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON in response");
    raw = raw.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");

    const parsed = JSON.parse(raw) as { scripts?: unknown[] };
    const rawScripts = Array.isArray(parsed.scripts) ? parsed.scripts : [];

    const scripts: ScriptOption[] = rawScripts
      .slice(0, 5)
      .map((s: unknown, i: number) => {
        const sc      = s as Record<string, unknown>;
        const scenes  = Array.isArray(sc.scenePrompts) ? sc.scenePrompts : [];
        const type    = SCRIPT_TYPES[i] ?? "experimental";
        return {
          id:             `script-${i}`,
          title:          String(sc.title ?? `Option ${i + 1}`),
          hook:           String(sc.hook  ?? ""),
          narration:      String(sc.narration ?? ""),
          scenePrompts:   [
            String(scenes[0] ?? ""),
            String(scenes[1] ?? ""),
            String(scenes[2] ?? ""),
          ] as [string, string, string],
          scriptType:     type,
          retentionScore: RETENTION_BY_TYPE[type],
          trendScore,
        };
      })
      .filter(s => s.narration.length > 20);

    if (!scripts.length) throw new Error("No valid scripts generated");

    // Track — non-blocking
    track(user.id, "script_generated", {
      niche,
      scriptCount: scripts.length,
      trendScore,
      hasTrendSignals: trendCtx.signals.length > 0,
    });
    await flushEvents();

    return Response.json({ scripts, trendScore });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-scripts] error:", msg);
    return Response.json({ error: `Script generation failed: ${msg}` }, { status: 500 });
  }
}
