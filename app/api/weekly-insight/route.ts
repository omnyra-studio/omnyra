/**
 * POST /api/weekly-insight
 *
 * Generates a personalised weekly insight report for a single creator using
 * their last 7 days of performance data, briefs, hooks, memory patterns,
 * and niche-specific trend signals. Called by an internal cron job — never
 * exposed to users directly.
 *
 * Auth: Bearer CRON_SECRET header (set CRON_SECRET in Vercel env vars).
 *
 * Vercel cron configuration — add to vercel.json:
 * {
 *   "crons": [
 *     {
 *       "path": "/api/weekly-insight",
 *       "schedule": "0 8 * * 1"
 *     }
 *   ]
 * }
 *
 * When called by Vercel Cron (no body), the route iterates all active users.
 * To generate for a single user (testing / manual trigger):
 *   POST /api/weekly-insight  { "userId": "<uuid>" }
 */

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { withTrace } from "@/lib/api/autopsy";

// ── System prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Omnyra's Weekly Intelligence Engine. You write one personalised insight report per creator per week.

Your job is not to summarise statistics. It is to surface the signal inside the noise — to tell the creator something specific they could not easily have spotted themselves.

TONE RULES (non-negotiable):
- Specific, never generic. "Your Tuesday contrarian hook outperformed by 34%" beats "you had a good week."
- Honest about thin data. "I think this worked because X — but your sample is only 3 posts, so treat this as a hypothesis, not a conclusion."
- Celebrate wins genuinely. No empty phrases like "Great job!" — say what actually worked and why.
- Analyse losses without blame. Frame as signal, not failure. "Retention dropped at 2.1s — same pattern as your February 14 post."
- Sound like a smart collaborator who spent an hour reviewing their week. Not a dashboard. Not a robot.

FOUR REQUIRED SECTIONS:

1. what_worked
   One post that outperformed (highest actual_score or biggest positive delta vs predicted_score).
   Why it likely succeeded — specific hypothesis tied to the hook type, psychological trigger, timing, or niche pattern.
   The pattern to repeat. Be concrete: "Your audience responds to contradiction hooks that include a specific number."

2. what_didnt
   One post that underperformed (lowest actual_score or biggest negative delta).
   Where retention likely dropped and why. Reference specific timestamps or hook patterns if available.
   Possible cause — name it without blame. "The question hook may have been too broad to create urgency."
   Assign a confidence level to your diagnosis: high / medium / low.

3. whats_changing
   One trend signal or audience shift you detected this week from the trend data.
   What specifically changed (rising keyword, velocity shift, new format gaining traction).
   What it means for this creator's niche and content strategy — not generic trend advice.

4. what_to_try_next
   One concrete, actionable recommendation. Not "post more" or "be consistent."
   A specific hook type, format, or timing hypothesis grounded in what you observed this week.
   How we will know if it worked (success criteria tied to their baseline).

OUTPUT FORMAT — raw JSON, no markdown, no code fences:
{
  "subject": "short, specific email subject — name the win or the insight, not a generic 'weekly update'",
  "body": "plain text email body, 200-350 words, conversational, flows through all four sections naturally without headers",
  "insights": {
    "what_worked": {
      "post_reference": "platform + date + hook snippet if available",
      "performance_delta": "+X% vs baseline or 'Xpts above predicted'",
      "pattern": "specific pattern that likely caused the outperformance",
      "repeat_signal": "exact thing to replicate in next post"
    },
    "what_didnt": {
      "post_reference": "platform + date + hook snippet if available",
      "performance_delta": "-X% vs baseline or description",
      "likely_cause": "specific hypothesis, not vague",
      "confidence": "high | medium | low"
    },
    "whats_changing": {
      "signal": "specific trend or audience shift with evidence",
      "velocity": "rising | stable | fading",
      "implication_for_creator": "what this means for their specific niche and next post"
    },
    "what_to_try_next": {
      "recommendation": "one concrete action",
      "hypothesis": "why this should work given what you observed",
      "success_criteria": "specific metric or signal that would confirm it worked"
    }
  }
}

If data is genuinely thin (fewer than 2 posts), write the insight anyway but open honestly:
"You only have one tracked post this week — not enough to find a reliable pattern. Here's what I can say from that single data point and your memory..."

Never invent numbers. If a delta is unknown, say "performance not tracked." If the week was bad, say so clearly and focus on the learning.`;

// ── Types ──────────────────────────────────────────────────────────────────────

interface WeeklyInsight {
  subject: string;
  body: string;
  insights: {
    what_worked: Record<string, string>;
    what_didnt: Record<string, string>;
    whats_changing: Record<string, string>;
    what_to_try_next: Record<string, string>;
  };
}

interface PerformanceRow {
  views: number | null;
  likes: number | null;
  comments: number | null;
  actual_score: number | null;
  predicted_score: number | null;
  platform: string | null;
  post_url: string | null;
  posted_at: string | null;
  projects: { niche: string | null; platform: string | null } | null;
}

interface BriefRow {
  recommended_angle: string | null;
  confidence_score: number | null;
  generated_at: string | null;
}

interface HookRow {
  hook_text: string | null;
  hook_type: string | null;
  status: string | null;
  score: number | null;
}

interface MemoryRow {
  memory_type: string;
  content: string;
  created_at: string;
}

interface TrendRow {
  niche: string | null;
  keyword: string | null;
  signal_strength: number | null;
  velocity: string | null;
}

// ── Handler ────────────────────────────────────────────────────────────────────

async function handler(request: Request): Promise<NextResponse> {
  // ── Auth — CRON_SECRET only ───────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────────
  let userId: string | undefined;
  try {
    const parsed = await request.json() as { userId?: string };
    userId = parsed.userId?.trim() || undefined;
  } catch {
    // Vercel Cron sends no body — treat as "process all active users"
  }

  // ── Resolve user list ─────────────────────────────────────────────────────────
  const userIds = userId ? [userId] : await fetchActiveUserIds();

  if (!userIds.length) {
    return NextResponse.json({ success: true, message: "No active users this week", processed: 0 });
  }

  // ── Generate for each user sequentially (avoid Anthropic rate limit bursts) ───
  const results: Array<{
    userId: string;
    status: "ok" | "skipped" | "error";
    insightId?: string;
    subject?: string;
    error?: string;
  }> = [];

  for (const uid of userIds) {
    const result = await safeGenerate(uid);
    results.push({ userId: uid, ...result });
  }

  return NextResponse.json({
    success: true,
    week_start: getWeekStart(),
    processed: results.length,
    ok:      results.filter((r) => r.status === "ok").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    errors:  results.filter((r) => r.status === "error").length,
    results,
  });
}

export const POST = withTrace(handler as (req: Request) => Promise<Response>);

// ── Fetch users who posted in the last 7 days ─────────────────────────────────

async function fetchActiveUserIds(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("performance_data")
    .select("projects!inner(user_id)")
    .gte("data_ingested_at", iso7DaysAgo())
    .limit(500);

  if (error) {
    console.error("[weekly-insight] fetchActiveUserIds error:", error);
    return [];
  }

  const seen = new Set<string>();
  for (const row of data ?? []) {
    const uid = (row.projects as unknown as { user_id: string } | null)?.user_id;
    if (uid) seen.add(uid);
  }
  return [...seen];
}

// ── Error-safe wrapper ─────────────────────────────────────────────────────────

async function safeGenerate(userId: string): Promise<{
  status: "ok" | "skipped" | "error";
  insightId?: string;
  subject?: string;
  error?: string;
}> {
  try {
    return await generateInsightForUser(userId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[weekly-insight] Failed for user ${userId}:`, msg);
    return { status: "error", error: msg };
  }
}

// ── Core generation ────────────────────────────────────────────────────────────

async function generateInsightForUser(userId: string): Promise<{
  status: "ok" | "skipped" | "error";
  insightId?: string;
  subject?: string;
}> {
  const weekStart = getWeekStart();

  // Idempotency — skip if already generated this week
  const { data: existing } = await supabaseAdmin
    .from("weekly_insights")
    .select("id, subject")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (existing) {
    return { status: "skipped", insightId: existing.id as string, subject: existing.subject as string };
  }

  // ── 1. Performance data — last 7 days ─────────────────────────────────────────
  const { data: perfData } = await supabaseAdmin
    .from("performance_data")
    .select(`
      views, likes, comments, actual_score, predicted_score,
      platform, post_url, posted_at,
      projects!inner ( niche, platform )
    `)
    .eq("projects.user_id", userId)
    .gte("data_ingested_at", iso7DaysAgo())
    .order("actual_score", { ascending: false })
    .limit(20) as { data: PerformanceRow[] | null };

  const performance = perfData ?? [];

  // Derive user's primary niche from performance data
  const userNiche = performance.find((p) => p.projects?.niche)?.projects?.niche ?? null;

  // ── 2. Briefs used this week ──────────────────────────────────────────────────
  const { data: briefData } = await supabaseAdmin
    .from("briefs")
    .select("recommended_angle, confidence_score, generated_at, projects!inner(user_id)")
    .eq("projects.user_id", userId)
    .gte("generated_at", iso7DaysAgo())
    .order("generated_at", { ascending: false })
    .limit(10) as { data: BriefRow[] | null };

  const briefs = briefData ?? [];

  // ── 3. Hooks — selected and reviewed this week ────────────────────────────────
  const { data: hookData } = await supabaseAdmin
    .from("hooks")
    .select("hook_text, hook_type, status, score, projects!inner(user_id)")
    .eq("projects.user_id", userId)
    .gte("generated_at", iso7DaysAgo())
    .in("status", ["selected", "rejected", "pending_review"])
    .order("score", { ascending: false })
    .limit(20) as { data: HookRow[] | null };

  const hooks = hookData ?? [];

  // ── 4. Creator memory patterns ────────────────────────────────────────────────
  const { data: memoryData } = await supabaseAdmin
    .from("creator_memory")
    .select("memory_type, content, created_at")
    .eq("user_id", userId)
    .in("memory_type", [
      "performance_pattern",
      "hook_selected",
      "hook_rejected",
      "prediction",
      "brief_generated",
    ])
    .order("created_at", { ascending: false })
    .limit(30) as { data: MemoryRow[] | null };

  const memory = memoryData ?? [];

  // ── 5. Trend signals for this creator's niche ─────────────────────────────────
  const trendQuery = supabaseAdmin
    .from("trend_signals")
    .select("niche, keyword, signal_strength, velocity")
    .gte("scraped_at", iso7DaysAgo())
    .order("signal_strength", { ascending: false })
    .limit(10);

  if (userNiche) trendQuery.eq("niche", userNiche);

  const { data: trendData } = await trendQuery as { data: TrendRow[] | null };
  const trends = trendData ?? [];

  // Skip users with zero useful data
  if (!performance.length && !memory.length && !briefs.length) {
    return { status: "skipped" };
  }

  // ── Build context prompt ──────────────────────────────────────────────────────
  const userPrompt = buildUserPrompt({
    weekStart,
    performance,
    briefs,
    hooks,
    memory,
    trends,
    userNiche,
  });

  // ── Call Claude ───────────────────────────────────────────────────────────────
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const aiResponse = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = aiResponse.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );

  if (!textBlock) {
    throw new Error("Anthropic returned no text block");
  }

  // ── Parse JSON ────────────────────────────────────────────────────────────────
  let insight: WeeklyInsight;
  try {
    const cleaned = textBlock.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    insight = JSON.parse(cleaned);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "parse error";
    throw new Error(
      `JSON parse failed (${msg}). Raw output: ${textBlock.text.slice(0, 400)}`,
    );
  }

  // ── Upsert weekly_insights (idempotent) ───────────────────────────────────────
  const { data: row, error: upsertErr } = await supabaseAdmin
    .from("weekly_insights")
    .upsert(
      {
        user_id:    userId,
        week_start: weekStart,
        subject:    insight.subject,
        body:       insight.body,
        insights:   insight.insights,
      },
      { onConflict: "user_id,week_start" },
    )
    .select("id")
    .single();

  if (upsertErr || !row) {
    throw new Error(`weekly_insights upsert failed: ${upsertErr?.message ?? "no row returned"}`);
  }

  return { status: "ok", insightId: row.id as string, subject: insight.subject };
}

// ── Prompt builder ─────────────────────────────────────────────────────────────

function buildUserPrompt({
  weekStart,
  performance,
  briefs,
  hooks,
  memory,
  trends,
  userNiche,
}: {
  weekStart: string;
  performance: PerformanceRow[];
  briefs: BriefRow[];
  hooks: HookRow[];
  memory: MemoryRow[];
  trends: TrendRow[];
  userNiche: string | null;
}): string {
  const parts: string[] = [`WEEKLY INSIGHT REQUEST — Week of ${weekStart}`];

  if (userNiche) parts.push(`CREATOR NICHE: ${userNiche}`);

  // ── Performance ──────────────────────────────────────────────────────────────
  if (performance.length > 0) {
    const sorted = [...performance].sort(
      (a, b) => (b.actual_score ?? 0) - (a.actual_score ?? 0),
    );

    const rows = sorted.map((p, i) => {
      const delta =
        p.actual_score != null && p.predicted_score != null
          ? `delta ${p.actual_score - p.predicted_score > 0 ? "+" : ""}${Math.round(p.actual_score - p.predicted_score)}pts vs predicted`
          : "no prediction to compare";

      return [
        `Post ${i + 1}: ${p.platform ?? "unknown"} — ${(p.views ?? 0).toLocaleString()} views`,
        `  Score: ${p.actual_score != null ? Math.round(p.actual_score) : "??"}/100 (${delta})`,
        p.posted_at ? `  Date: ${p.posted_at.slice(0, 10)}` : "",
        p.post_url  ? `  URL: ${p.post_url}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    });

    parts.push(`PERFORMANCE DATA (${performance.length} posts this week, ranked best → worst)\n${rows.join("\n\n")}`);
  } else {
    parts.push("PERFORMANCE DATA: No posts tracked this week.");
  }

  // ── Briefs ───────────────────────────────────────────────────────────────────
  if (briefs.length > 0) {
    const rows = briefs.map(
      (b) =>
        `- "${b.recommended_angle ?? "unknown"}" | confidence ${b.confidence_score != null ? Math.round(b.confidence_score * 100) + "%" : "??"} | ${b.generated_at?.slice(0, 10) ?? ""}`,
    );
    parts.push(`BRIEFS GENERATED THIS WEEK\n${rows.join("\n")}`);
  }

  // ── Hooks — split by status ───────────────────────────────────────────────────
  const selectedHooks = hooks.filter((h) => h.status === "selected");
  const rejectedHooks = hooks.filter((h) => h.status === "rejected");

  if (selectedHooks.length > 0) {
    const rows = selectedHooks.map(
      (h) => `- [${h.hook_type ?? "?"}] "${h.hook_text ?? "unknown"}" (score: ${h.score != null ? Math.round(h.score) : "??"})`,
    );
    parts.push(`HOOKS SELECTED THIS WEEK\n${rows.join("\n")}`);
  }

  if (rejectedHooks.length > 0) {
    const rows = rejectedHooks.map(
      (h) => `- [${h.hook_type ?? "?"}] "${h.hook_text ?? "unknown"}"`,
    );
    parts.push(`HOOKS REJECTED THIS WEEK\n${rows.join("\n")}`);
  }

  // ── Creator memory ────────────────────────────────────────────────────────────
  const patterns = memory.filter((m) => m.memory_type === "performance_pattern");
  if (patterns.length > 0) {
    parts.push(
      `CREATOR PERFORMANCE PATTERNS (from memory)\n${patterns.map((m) => `- ${m.content}`).join("\n")}`,
    );
  }

  const predictions = memory.filter((m) => m.memory_type === "prediction");
  if (predictions.length > 0) {
    parts.push(
      `PREDICTIONS MADE THIS WEEK\n${predictions.map((m) => `- ${m.content}`).join("\n")}`,
    );
  }

  // ── Trend signals ─────────────────────────────────────────────────────────────
  if (trends.length > 0) {
    const rows = trends.map(
      (t) =>
        `- "${t.keyword ?? "unknown"}"${t.niche ? ` (${t.niche})` : ""}: strength ${t.signal_strength ?? "??"}/100, velocity ${t.velocity ?? "unknown"}`,
    );
    parts.push(`TREND SIGNALS THIS WEEK\n${rows.join("\n")}`);
  } else {
    parts.push("TREND SIGNALS: No fresh signals this week.");
  }

  parts.push(
    "Generate the weekly insight now. Be specific to this data. Reference exact numbers. Be honest about uncertainty. Sound like a collaborator.",
  );

  return parts.join("\n\n");
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function iso7DaysAgo(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

/** ISO date string for the Monday of the current UTC week */
function getWeekStart(): string {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sun
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + daysToMonday);
  return monday.toISOString().slice(0, 10);
}
