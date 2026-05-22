/* Analytics aggregation engine.
 *
 * Computes global / user / template metrics from the events stream and
 * appends them to analytics_snapshots. APPEND-ONLY — historical
 * snapshots are preserved for trend analysis.
 *
 * Spec rule: "NO OTHER TABLE IS TRUSTED FOR ANALYTICS." This module
 * reads events directly for engagement counts. It uses the score
 * tables (content_scores, user_scores) ONLY for values that are
 * themselves deterministic aggregations of events (i.e. the same
 * computation, just cached).
 *
 * Server-only.
 */

import { supabaseAdmin } from "../supabase/admin";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export interface SnapshotInput {
  metric_name: string;
  scope: "global" | "user" | "template";
  dimension_id?: string | null;
  value: number;
  context?: Record<string, unknown>;
  window_start: Date;
  window_end: Date;
}

async function writeSnapshot(s: SnapshotInput): Promise<void> {
  const { error } = await supabaseAdmin.from("analytics_snapshots").insert({
    metric_name: s.metric_name,
    scope: s.scope,
    dimension_id: s.dimension_id ?? null,
    value: s.value,
    context: s.context ?? {},
    window_start: s.window_start.toISOString(),
    window_end: s.window_end.toISOString(),
  });
  if (error) {
    console.error(`[snapshots] write failed (${s.metric_name}):`, error.message);
  }
}

async function countEvents(type: string, since: Date, until: Date): Promise<number> {
  const { count } = await supabaseAdmin
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("type", type)
    .gte("created_at", since.toISOString())
    .lt("created_at", until.toISOString());
  return count ?? 0;
}

async function distinctUsers(type: string, since: Date, until: Date): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from("events")
    .select("user_id")
    .eq("type", type)
    .gte("created_at", since.toISOString())
    .lt("created_at", until.toISOString())
    .not("user_id", "is", null);
  return new Set((data ?? []).map((r) => r.user_id as string));
}

/* ────────────────────────────────────────────────────────────────
 *  Global metrics
 * ─────────────────────────────────────────────────────────────── */

async function snapshotGlobal(now: Date): Promise<number> {
  const w7 = new Date(now.getTime() - 7 * DAY);
  const w30 = new Date(now.getTime() - 30 * DAY);
  let written = 0;

  // ── activation_rate (7d) ───────────────────────────────────────
  const signups7d = await distinctUsers("user_signed_up", w7, now);
  const completions7d = await distinctUsers("render_completed", w7, now);
  const activated = new Set([...signups7d].filter((u) => completions7d.has(u)));
  const activation_rate = signups7d.size === 0 ? 0 : activated.size / signups7d.size;
  await writeSnapshot({
    metric_name: "activation_rate",
    scope: "global",
    value: activation_rate,
    context: { signups: signups7d.size, activated: activated.size },
    window_start: w7,
    window_end: now,
  });
  written += 1;

  // ── time_to_first_video (median seconds) ──────────────────────
  const { data: ttfv } = await supabaseAdmin
    .from("time_to_first_video")
    .select("seconds_to_first_video")
    .not("seconds_to_first_video", "is", null);
  const tts = (ttfv ?? [])
    .map((r) => Number(r.seconds_to_first_video))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const median = tts.length === 0 ? 0 : tts[Math.floor(tts.length / 2)];
  await writeSnapshot({
    metric_name: "time_to_first_video",
    scope: "global",
    value: median,
    context: { sample_size: tts.length },
    window_start: w30,
    window_end: now,
  });
  written += 1;

  // ── retention_day_1 + day_7 ────────────────────────────────────
  // Of users who signed up N days ago, what % had any event today?
  for (const dayN of [1, 7]) {
    const cohortStart = new Date(now.getTime() - (dayN + 7) * DAY); // 7-day cohort
    const cohortEnd = new Date(now.getTime() - dayN * DAY);
    const cohortSignups = await distinctUsers("user_signed_up", cohortStart, cohortEnd);

    if (cohortSignups.size === 0) {
      await writeSnapshot({
        metric_name: `retention_day_${dayN}`,
        scope: "global",
        value: 0,
        context: { cohort_size: 0 },
        window_start: cohortStart,
        window_end: now,
      });
      written += 1;
      continue;
    }

    // Active = any event in the [today - 1d, now] window.
    const activeWindow = new Date(now.getTime() - DAY);
    const { data: activeRows } = await supabaseAdmin
      .from("events")
      .select("user_id")
      .gte("created_at", activeWindow.toISOString())
      .in("user_id", Array.from(cohortSignups));
    const activeIds = new Set((activeRows ?? []).map((r) => r.user_id as string));
    const rate = activeIds.size / cohortSignups.size;

    await writeSnapshot({
      metric_name: `retention_day_${dayN}`,
      scope: "global",
      value: rate,
      context: { cohort_size: cohortSignups.size, active: activeIds.size },
      window_start: cohortStart,
      window_end: now,
    });
    written += 1;
  }

  // ── avg_viral_score (last 30d completed renders) ──────────────
  const { data: scoreRows } = await supabaseAdmin
    .from("content_scores")
    .select("viral_score")
    .gte("recalculated_at", w30.toISOString());
  const scores = (scoreRows ?? [])
    .map((r) => Number(r.viral_score))
    .filter(Number.isFinite);
  const avgVS = scores.length === 0 ? 0 : scores.reduce((a, b) => a + b, 0) / scores.length;
  await writeSnapshot({
    metric_name: "avg_viral_score",
    scope: "global",
    value: avgVS,
    context: { sample_size: scores.length },
    window_start: w30,
    window_end: now,
  });
  written += 1;

  // ── revenue_per_user (30d, from credit_transactions where amount>0) ─
  // We use credit_transactions with type IN ('subscription','topup') as
  // the revenue signal — these correspond to real Stripe-driven grants.
  // amount is in credits; convert to dollars via a per-credit price
  // estimate (env-tunable). Defaults to 0.10 USD per credit.
  const pricePerCredit = Number(process.env.REVENUE_PRICE_PER_CREDIT ?? "0.10");
  const { data: rev } = await supabaseAdmin
    .from("credit_transactions")
    .select("user_id, amount")
    .in("type", ["subscription", "topup"])
    .gte("created_at", w30.toISOString())
    .gt("amount", 0);
  const revByUser = new Map<string, number>();
  for (const r of (rev ?? []) as Array<{ user_id: string; amount: number }>) {
    revByUser.set(r.user_id, (revByUser.get(r.user_id) ?? 0) + Number(r.amount));
  }
  const totalRev = Array.from(revByUser.values()).reduce((a, b) => a + b, 0) * pricePerCredit;
  const activeUsers = await distinctUsers("brief_submitted", w30, now);
  const arpu = activeUsers.size === 0 ? 0 : totalRev / activeUsers.size;
  await writeSnapshot({
    metric_name: "revenue_per_user",
    scope: "global",
    value: arpu,
    context: {
      total_revenue_usd: totalRev,
      paying_users: revByUser.size,
      active_users: activeUsers.size,
      price_per_credit: pricePerCredit,
    },
    window_start: w30,
    window_end: now,
  });
  written += 1;

  return written;
}

/* ────────────────────────────────────────────────────────────────
 *  User-level metrics (snapshotted from user_scores)
 * ─────────────────────────────────────────────────────────────── */

async function snapshotUsers(now: Date, limit: number = 1000): Promise<number> {
  const w30 = new Date(now.getTime() - 30 * DAY);
  let written = 0;

  const { data } = await supabaseAdmin
    .from("user_scores")
    .select("user_id, composite_score, avg_viral_score, credit_efficiency, churn_risk_score")
    .order("scored_at", { ascending: false })
    .limit(limit);

  for (const u of (data ?? []) as Array<{
    user_id: string;
    composite_score: number;
    avg_viral_score: number;
    credit_efficiency: number;
    churn_risk_score: number;
  }>) {
    await writeSnapshot({
      metric_name: "user_engagement_score",
      scope: "user",
      dimension_id: u.user_id,
      value: Number(u.composite_score),
      context: {
        avg_viral_score: Number(u.avg_viral_score),
        credit_efficiency: Number(u.credit_efficiency),
      },
      window_start: w30,
      window_end: now,
    });
    await writeSnapshot({
      metric_name: "churn_risk_score",
      scope: "user",
      dimension_id: u.user_id,
      value: Number(u.churn_risk_score),
      context: {},
      window_start: w30,
      window_end: now,
    });
    await writeSnapshot({
      metric_name: "credit_efficiency",
      scope: "user",
      dimension_id: u.user_id,
      value: Number(u.credit_efficiency),
      context: {},
      window_start: w30,
      window_end: now,
    });
    written += 3;
  }

  return written;
}

/* ────────────────────────────────────────────────────────────────
 *  Template-level metrics
 * ─────────────────────────────────────────────────────────────── */

async function snapshotTemplates(now: Date): Promise<number> {
  const w30 = new Date(now.getTime() - 30 * DAY);
  let written = 0;

  // template_scores already has per-template aggregates.
  const { data: ts } = await supabaseAdmin
    .from("template_scores")
    .select("template, avg_viral_score, composite_score, completed_renders, total_renders");

  // viral_velocity comes from content_performance (we keep both layers
  // — template_scores is the canonical batch output, content_performance
  // has the velocity column added earlier).
  const { data: cp } = await supabaseAdmin
    .from("content_performance")
    .select("template, viral_score_velocity, completion_rate");

  const velMap = new Map<string, { velocity: number; completion: number }>();
  for (const r of (cp ?? []) as Array<{
    template: string;
    viral_score_velocity: number;
    completion_rate: number;
  }>) {
    velMap.set(r.template, {
      velocity: Number(r.viral_score_velocity),
      completion: Number(r.completion_rate),
    });
  }

  for (const t of (ts ?? []) as Array<{
    template: string;
    avg_viral_score: number;
    composite_score: number;
    completed_renders: number;
    total_renders: number;
  }>) {
    const successRate =
      t.total_renders > 0 ? t.completed_renders / t.total_renders : 0;
    const vel = velMap.get(t.template);

    await writeSnapshot({
      metric_name: "template_success_rate",
      scope: "template",
      dimension_id: t.template,
      value: successRate,
      context: { total: t.total_renders, completed: t.completed_renders },
      window_start: w30,
      window_end: now,
    });
    await writeSnapshot({
      metric_name: "avg_completion_rate",
      scope: "template",
      dimension_id: t.template,
      value: vel?.completion ?? 0,
      context: {},
      window_start: w30,
      window_end: now,
    });
    await writeSnapshot({
      metric_name: "viral_velocity",
      scope: "template",
      dimension_id: t.template,
      value: vel?.velocity ?? 0,
      context: { current_avg_viral_score: Number(t.avg_viral_score) },
      window_start: w30,
      window_end: now,
    });
    written += 3;
  }

  return written;
}

export interface AggregateResult {
  global_rows: number;
  user_rows: number;
  template_rows: number;
  duration_ms: number;
}

export async function runAnalyticsAggregation(): Promise<AggregateResult> {
  const started = Date.now();
  const now = new Date();
  const [globalRows, userRows, templateRows] = await Promise.all([
    snapshotGlobal(now),
    snapshotUsers(now),
    snapshotTemplates(now),
  ]);
  return {
    global_rows: globalRows,
    user_rows: userRows,
    template_rows: templateRows,
    duration_ms: Date.now() - started,
  };
}
