/**
 * GET /api/admin/metrics
 *
 * Aggregates pipeline health, cost, latency, and failure data for the
 * founder dashboard.  Requires ADMIN_EMAIL env var — returns 403 when
 * the authenticated user's email does not match.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 30;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";

async function requireAdmin(): Promise<{ email: string } | null> {
  if (!ADMIN_EMAIL) return null;
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) return null;
  return { email: user.email };
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const now     = new Date();
  const ago24h  = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const ago7d   = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const ago30d  = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Run all queries in parallel
  const [
    jobs7d,
    jobs24h,
    processingNow,
    stageLedger7d,
    providerCosts7d,
    failedJobs7d,
    cacheStats,
    recentJobs,
  ] = await Promise.all([
    // All jobs in last 7 days for aggregate stats
    supabaseAdmin
      .from("avatar_jobs")
      .select("id, status, retry_count, created_at, updated_at")
      .gte("created_at", ago7d),

    // Jobs in last 24h by status
    supabaseAdmin
      .from("avatar_jobs")
      .select("id, status")
      .gte("created_at", ago24h),

    // Currently processing
    supabaseAdmin
      .from("avatar_jobs")
      .select("id, stage, pipeline_status")
      .eq("status", "processing"),

    // Stage ledger for latency analysis (7d)
    supabaseAdmin
      .from("avatar_stage_ledger")
      .select("job_id, stage, status, created_at, updated_at")
      .eq("status", "completed")
      .gte("created_at", ago7d),

    // Provider cost breakdown (7d)
    supabaseAdmin
      .from("external_api_cost_ledger")
      .select("provider, stage, cost_estimate, status")
      .eq("status", "charged")
      .gte("created_at", ago7d),

    // Failed jobs with error info (7d)
    supabaseAdmin
      .from("avatar_jobs")
      .select("id, stage, last_error_code, error")
      .eq("status", "failed")
      .gte("created_at", ago7d)
      .limit(100),

    // Prompt memory cache stats
    supabaseAdmin
      .from("prompt_memory_cache")
      .select("usage_count, success_score"),

    // 20 most recent jobs for the job table
    supabaseAdmin
      .from("avatar_jobs")
      .select("id, status, stage, pipeline_status, error, retry_count, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // ── Overview stats ────────────────────────────────────────────────────────
  const jobs24hData  = jobs24h.data  ?? [];
  const jobs7dData   = jobs7d.data   ?? [];

  const total24h      = jobs24hData.length;
  const completed24h  = jobs24hData.filter(j => j.status === "completed").length;
  const failed24h     = jobs24hData.filter(j => j.status === "failed").length;
  const processingCount = (processingNow.data ?? []).length;

  const completed7d   = jobs7dData.filter(j => j.status === "completed");
  const failed7d      = jobs7dData.filter(j => j.status === "failed");
  const success_rate_7d = jobs7dData.length > 0
    ? Math.round((completed7d.length / jobs7dData.length) * 100)
    : 0;

  // Duration = updated_at - created_at for completed jobs
  const durations = completed7d
    .map(j => new Date(j.updated_at).getTime() - new Date(j.created_at).getTime())
    .filter(d => d > 0 && d < 30 * 60 * 1000); // sanity: < 30 min
  const avg_duration_ms = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  // ── Stage latency breakdown ───────────────────────────────────────────────
  const ledger = stageLedger7d.data ?? [];
  const latencyByStage: Record<string, number[]> = {};
  for (const entry of ledger) {
    const dur = new Date(entry.updated_at).getTime() - new Date(entry.created_at).getTime();
    if (dur <= 0 || dur > 30 * 60 * 1000) continue;
    (latencyByStage[entry.stage] ??= []).push(dur);
  }
  const stage_latencies = Object.entries(latencyByStage).map(([stage, times]) => {
    const sorted = [...times].sort((a, b) => a - b);
    return {
      stage,
      avg_ms:  Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      p95_ms:  percentile(sorted, 95),
      count:   times.length,
    };
  }).sort((a, b) => ["tts", "animate", "lipsync"].indexOf(a.stage) - ["tts", "animate", "lipsync"].indexOf(b.stage));

  // ── Provider cost breakdown ───────────────────────────────────────────────
  const costs = providerCosts7d.data ?? [];
  const costByProvider: Record<string, { total: number; count: number }> = {};
  for (const c of costs) {
    const p = costByProvider[c.provider] ??= { total: 0, count: 0 };
    p.total += Number(c.cost_estimate ?? 0);
    p.count++;
  }
  const provider_costs = Object.entries(costByProvider).map(([provider, { total, count }]) => ({
    provider,
    total_credits: Math.round(total),
    avg_credits:   Math.round(total / count),
    job_count:     count,
  }));

  const avg_cost_credits_7d = completed7d.length > 0
    ? Math.round(costs.reduce((a, c) => a + Number(c.cost_estimate ?? 0), 0) / Math.max(completed7d.length, 1))
    : 0;

  // ── Failure analysis ──────────────────────────────────────────────────────
  const failedData = failedJobs7d.data ?? [];
  const failuresByStage: Record<string, { count: number; sample_error: string | null }> = {};
  for (const f of failedData) {
    const key = f.last_error_code ?? f.stage ?? "unknown";
    const entry = failuresByStage[key] ??= { count: 0, sample_error: null };
    entry.count++;
    if (!entry.sample_error && f.error) entry.sample_error = f.error.substring(0, 120);
  }
  const failures = Object.entries(failuresByStage)
    .map(([stage, { count, sample_error }]) => ({ stage, count, sample_error }))
    .sort((a, b) => b.count - a.count);

  // ── Prompt cache stats ────────────────────────────────────────────────────
  const cacheData = cacheStats.data ?? [];
  const cache_stats = {
    total_entries: cacheData.length,
    avg_usage_count: cacheData.length
      ? Math.round(cacheData.reduce((a, c) => a + c.usage_count, 0) / cacheData.length)
      : 0,
    avg_score: cacheData.length
      ? parseFloat((cacheData.reduce((a, c) => a + Number(c.success_score), 0) / cacheData.length).toFixed(2))
      : 0,
  };

  // ── Recent jobs table ─────────────────────────────────────────────────────
  const recent_jobs = (recentJobs.data ?? []).map(j => ({
    id:              j.id.substring(0, 8),
    full_id:         j.id,
    status:          j.status,
    stage:           j.stage,
    pipeline_status: j.pipeline_status,
    error:           j.error ? j.error.substring(0, 80) : null,
    retry_count:     j.retry_count,
    duration_ms:     Math.max(0, new Date(j.updated_at).getTime() - new Date(j.created_at).getTime()),
    created_at:      j.created_at,
  }));

  return Response.json({
    overview: {
      total_24h:           total24h,
      completed_24h:       completed24h,
      failed_24h:          failed24h,
      processing_now:      processingCount,
      success_rate_7d,
      avg_duration_ms:     avg_duration_ms,
      avg_cost_credits_7d,
      total_jobs_7d:       jobs7dData.length,
    },
    active_jobs: (processingNow.data ?? []).map(j => ({
      id:              j.id.substring(0, 8),
      stage:           j.stage,
      pipeline_status: j.pipeline_status,
    })),
    stage_latencies,
    provider_costs,
    failures,
    cache_stats,
    recent_jobs,
    generated_at: now.toISOString(),
  });
}
