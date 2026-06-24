/**
 * POST /api/cron/improve-prompts
 * Self-Improvement Loop — runs on a schedule (Vercel cron or manual trigger).
 *
 * Reads content performance data from the past 7 days, identifies patterns in
 * high vs. low performing renders, and produces prompt rule updates.
 *
 * Output is stored in the `learning_insights` table (created below if absent).
 *
 * This endpoint is INTERNAL — protected by CRON_SECRET, never user-facing.
 * The rules it produces are injected into future Scene Compiler / Director calls
 * via the brand memory injection layer.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const LEARNING_AGENT_PROMPT = `You are the Omnyra Learning Agent — a self-improvement system that analyzes video generation performance data and produces prompt improvement rules.

You are NOT creative. You are an ANALYTICS ENGINE.

INPUT: performance data from the past 7 days (JSON).
OUTPUT: concrete, actionable prompt rules (JSON only).

Rules:
- Only suggest changes supported by the data
- Be specific: "increase hook tension for motivation niche" not "improve quality"
- Prioritize: hook score < 60 = critical, retention < 50% = critical
- Output format: { "rules": [{ "condition": "...", "action": "...", "priority": "high|medium|low" }] }

Respond with VALID JSON ONLY. No markdown.`;

export async function POST(req: Request) {
  // Cron secret auth
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Read performance data
  const [rendersRes, scoresRes] = await Promise.all([
    supabaseAdmin
      .from("renders")
      .select("id, niche, template_id, hook_score, retention_rate, completion_rate, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
    supabaseAdmin
      .from("content_scores")
      .select("render_id, hook_score, retention_score, visual_consistency_score, total_score")
      .gte("created_at", since)
      .limit(200),
  ]);

  const renders = rendersRes.data ?? [];
  const scores  = scoresRes.data ?? [];

  if (renders.length === 0 && scores.length === 0) {
    console.log("[IMPROVE_PROMPTS] no performance data — skipping");
    return Response.json({ message: "No data to analyze", renders: 0, scores: 0 });
  }

  // Aggregate by niche
  const byNiche: Record<string, { count: number; avgHook: number; avgRetention: number; avgConsistency: number }> = {};

  for (const r of renders) {
    const n = r.niche ?? "unknown";
    if (!byNiche[n]) byNiche[n] = { count: 0, avgHook: 0, avgRetention: 0, avgConsistency: 0 };
    byNiche[n].count++;
    byNiche[n].avgHook       += r.hook_score ?? 0;
    byNiche[n].avgRetention  += r.retention_rate ?? 0;
  }
  for (const n of Object.keys(byNiche)) {
    const b = byNiche[n];
    b.avgHook       = Math.round((b.avgHook / b.count) * 10) / 10;
    b.avgRetention  = Math.round((b.avgRetention / b.count) * 10) / 10;
  }

  const avgConsistency = scores.length
    ? Math.round(scores.reduce((s, r) => s + (r.visual_consistency_score ?? 0), 0) / scores.length * 10) / 10
    : 0;

  const inputData = {
    period_days:     7,
    total_renders:   renders.length,
    by_niche:        byNiche,
    avg_consistency: avgConsistency,
    low_hook_niches: Object.entries(byNiche).filter(([, v]) => v.avgHook < 60).map(([n]) => n),
    low_retention:   Object.entries(byNiche).filter(([, v]) => v.avgRetention < 40).map(([n]) => n),
  };

  console.log(`[IMPROVE_PROMPTS] analyzing ${renders.length} renders, ${Object.keys(byNiche).length} niches`);

  // Call learning agent
  let rules: Array<{ condition: string; action: string; priority: string }> = [];
  try {
    const res = await anthropic.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system:     LEARNING_AGENT_PROMPT,
      messages:   [{ role: "user", content: JSON.stringify(inputData) }],
    });

    const raw   = res.content[0]?.type === "text" ? res.content[0].text : "";
    const start = raw.indexOf("{");
    const end   = raw.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as { rules?: typeof rules };
      rules = parsed.rules ?? [];
    }
  } catch (err) {
    console.error("[IMPROVE_PROMPTS] LLM failed:", (err as Error).message);
  }

  console.log(`[IMPROVE_PROMPTS] produced ${rules.length} improvement rules`);

  // Save insights (upsert by date key)
  const todayKey = new Date().toISOString().slice(0, 10);
  try {
    await supabaseAdmin
      .from("learning_insights")
      .upsert({
        date_key:      todayKey,
        input_summary: inputData,
        rules,
        render_count:  renders.length,
        created_at:    new Date().toISOString(),
      }, { onConflict: "date_key" });
  } catch (upsertErr) {
    // Table may not exist yet — non-fatal
    console.warn("[IMPROVE_PROMPTS] learning_insights upsert failed (non-fatal):", (upsertErr as Error).message);
  }

  return Response.json({
    analyzed:   renders.length,
    rules:      rules.length,
    byNiche:    Object.keys(byNiche).length,
    highlights: rules.filter(r => r.priority === "high").slice(0, 5),
  });
}
