"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Overview {
  total_24h: number;
  completed_24h: number;
  failed_24h: number;
  processing_now: number;
  success_rate_7d: number;
  avg_duration_ms: number;
  avg_cost_credits_7d: number;
  total_jobs_7d: number;
}

interface ActiveJob {
  id: string;
  stage: string | null;
  pipeline_status: string | null;
}

interface StageLatency {
  stage: string;
  avg_ms: number;
  p95_ms: number;
  count: number;
}

interface ProviderCost {
  provider: string;
  total_credits: number;
  avg_credits: number;
  job_count: number;
}

interface Failure {
  stage: string;
  count: number;
  sample_error: string | null;
}

interface CacheStats {
  total_entries: number;
  avg_usage_count: number;
  avg_score: number;
}

interface RecentJob {
  id: string;
  full_id: string;
  status: string;
  stage: string | null;
  pipeline_status: string | null;
  error: string | null;
  retry_count: number;
  duration_ms: number;
  created_at: string;
}

interface DashboardData {
  overview: Overview;
  active_jobs: ActiveJob[];
  stage_latencies: StageLatency[];
  provider_costs: ProviderCost[];
  failures: Failure[];
  cache_stats: CacheStats;
  recent_jobs: RecentJob[];
  generated_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function fmtAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)  return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3600_000)}h ago`;
}

const STATUS_COLOR: Record<string, string> = {
  completed:  "#4ECB8C",
  failed:     "#FF6B6B",
  processing: "#C9A84C",
  queued:     "#8A7D92",
};

const STAGE_LABELS: Record<string, string> = {
  tts:     "TTS",
  animate: "Animate",
  lipsync: "Hedra",
};

const PROVIDER_LABELS: Record<string, string> = {
  elevenlabs:    "ElevenLabs",
  kling:         "Kling",
  hedra:         "Hedra",
  "hedra-bypass": "Hedra Bypass",
};

// ── Styles ─────────────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background:    "rgba(75,30,130,0.65)",
  backdropFilter:"blur(12px)",
  border:        "1px solid rgba(207,164,47,0.2)",
  borderRadius:  14,
  padding:       "20px 24px",
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize:       12,
  fontWeight:     700,
  color:          "rgba(207,164,47,0.9)",
  textTransform:  "uppercase",
  letterSpacing:  "0.15em",
  marginBottom:   16,
};

const STAT_VALUE: React.CSSProperties = {
  fontSize:   28,
  fontWeight: 800,
  color:      "#FFFFFF",
  lineHeight: 1.1,
};

const STAT_LABEL: React.CSSProperties = {
  fontSize:  12,
  color:     "rgba(255,255,255,0.5)",
  marginTop:  4,
};

// ── Bar fill component ─────────────────────────────────────────────────────────

function BarFill({ value, max, color = "#C9A84C" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ width: "100%", height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
    </div>
  );
}

// ── Dashboard component ────────────────────────────────────────────────────────

export default function FounderDashboard() {
  const router  = useRouter();
  const [data,  setData]    = useState<DashboardData | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/metrics");
      if (res.status === 403) { router.replace("/dashboard"); return; }
      if (!res.ok) { setError(`Failed to load metrics (${res.status})`); return; }
      const d = await res.json() as DashboardData;
      setData(d);
      setLastRefresh(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#C9A84C", fontSize: 13 }}>Loading metrics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#FF6B6B", fontSize: 13 }}>{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { overview, active_jobs, stage_latencies, provider_costs, failures, cache_stats, recent_jobs } = data;
  const maxStageMs  = Math.max(...stage_latencies.map(s => s.p95_ms), 1);
  const maxFailures = Math.max(...failures.map(f => f.count), 1);

  return (
    <div style={{ minHeight: "100vh", background: "transparent", padding: "24px 24px 80px", maxWidth: 1100, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#C9A84C", margin: 0, letterSpacing: "0.05em" }}>
            OMNYRA OPS
          </h1>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: "4px 0 0" }}>
            Founder Control Dashboard
            {lastRefresh && ` · refreshed ${fmtAgo(lastRefresh.toISOString())}`}
          </p>
        </div>
        <button
          onClick={() => void load()}
          style={{ background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 8, color: "#C9A84C", padding: "7px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
        >
          Refresh
        </button>
      </div>

      {/* ── Overview cards ────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>

        {[
          { label: "Jobs today",      value: overview.total_24h,           sub: `${overview.completed_24h} done · ${overview.failed_24h} failed` },
          { label: "Success rate 7d", value: `${overview.success_rate_7d}%`, sub: `${overview.total_jobs_7d} total jobs` },
          { label: "Avg render time", value: fmtMs(overview.avg_duration_ms), sub: "completed jobs" },
          { label: "Avg cost",        value: `${overview.avg_cost_credits_7d}cr`, sub: "per video, 7d" },
          { label: "Active now",      value: overview.processing_now,       sub: "running" },
        ].map(({ label, value, sub }) => (
          <div key={label} style={CARD}>
            <div style={STAT_VALUE}>{value}</div>
            <div style={STAT_LABEL}>{label}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── Active jobs + recent jobs ──────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16, marginBottom: 24 }}>

        {/* Active jobs */}
        <div style={CARD}>
          <p style={SECTION_TITLE}>Active Jobs ({active_jobs.length})</p>
          {active_jobs.length === 0 ? (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No jobs running</p>
          ) : (
            active_jobs.map(j => (
              <div key={j.id} style={{ marginBottom: 10, padding: "8px 10px", background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#C9A84C", fontFamily: "monospace" }}>{j.id}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                  {j.stage ?? "—"} {j.pipeline_status ? `· ${j.pipeline_status}` : ""}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Recent jobs table */}
        <div style={CARD}>
          <p style={SECTION_TITLE}>Recent Jobs</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "rgba(255,255,255,0.4)" }}>
                  {["ID", "Status", "Stage", "Duration", "Retries", "Created"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent_jobs.map(j => (
                  <tr key={j.full_id} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "6px 8px", fontFamily: "monospace", color: "#BBA8C8" }}>{j.id}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <span style={{ color: STATUS_COLOR[j.status] ?? "#8A7D92", fontWeight: 600 }}>{j.status}</span>
                    </td>
                    <td style={{ padding: "6px 8px", color: "rgba(255,255,255,0.5)" }}>{j.stage ?? "—"}</td>
                    <td style={{ padding: "6px 8px", color: "rgba(255,255,255,0.7)" }}>{fmtMs(j.duration_ms)}</td>
                    <td style={{ padding: "6px 8px", color: j.retry_count > 0 ? "#F0C040" : "rgba(255,255,255,0.4)" }}>{j.retry_count}</td>
                    <td style={{ padding: "6px 8px", color: "rgba(255,255,255,0.4)" }}>{fmtAgo(j.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Performance + Cost ────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>

        {/* Stage latency */}
        <div style={CARD}>
          <p style={SECTION_TITLE}>Stage Latency (7d)</p>
          {stage_latencies.length === 0 ? (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No data yet</p>
          ) : (
            stage_latencies.map(s => (
              <div key={s.stage} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#FFFFFF" }}>{STAGE_LABELS[s.stage] ?? s.stage}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                    avg {fmtMs(s.avg_ms)} · p95 {fmtMs(s.p95_ms)} · {s.count} runs
                  </span>
                </div>
                <BarFill value={s.p95_ms} max={maxStageMs} color="#7C6FFF" />
              </div>
            ))
          )}
        </div>

        {/* Provider cost breakdown */}
        <div style={CARD}>
          <p style={SECTION_TITLE}>Provider Cost (7d avg per call)</p>
          {provider_costs.length === 0 ? (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No data yet</p>
          ) : (
            provider_costs.map(p => (
              <div key={p.provider} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#FFFFFF" }}>{PROVIDER_LABELS[p.provider] ?? p.provider}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                    {p.avg_credits}cr avg · {p.total_credits}cr total · {p.job_count} calls
                  </span>
                </div>
                <BarFill value={p.avg_credits} max={Math.max(...provider_costs.map(x => x.avg_credits), 1)} color="#C9A84C" />
              </div>
            ))
          )}
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Avg total per video (7d): </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#C9A84C" }}>{overview.avg_cost_credits_7d} credits</span>
          </div>
        </div>
      </div>

      {/* ── Failures + Cache ──────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Failure analysis */}
        <div style={CARD}>
          <p style={SECTION_TITLE}>Failure Analysis (7d)</p>
          {failures.length === 0 ? (
            <p style={{ fontSize: 12, color: "#4ECB8C" }}>No failures — all clear</p>
          ) : (
            failures.map(f => (
              <div key={f.stage} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#FF6B6B" }}>{f.stage}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{f.count} failures</span>
                </div>
                <BarFill value={f.count} max={maxFailures} color="#FF6B6B" />
                {f.sample_error && (
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: "4px 0 0", fontFamily: "monospace", wordBreak: "break-all" }}>
                    {f.sample_error}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        {/* Prompt cache + system health */}
        <div style={CARD}>
          <p style={SECTION_TITLE}>Prompt Memory Cache</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Cached prompts", value: cache_stats.total_entries },
              { label: "Avg reuse",      value: `×${cache_stats.avg_usage_count}` },
              { label: "Avg score",      value: cache_stats.avg_score.toFixed(2) },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#E879F9" }}>{value}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>{label}</div>
              </div>
            ))}
          </div>

          <p style={{ ...SECTION_TITLE, marginTop: 8 }}>System Health (7d)</p>
          {(() => {
            const failRate = overview.total_jobs_7d > 0
              ? (100 - overview.success_rate_7d)
              : 0;
            const score = Math.max(0, Math.round(overview.success_rate_7d - (failRate * 0.5)));
            const color = score >= 90 ? "#4ECB8C" : score >= 70 ? "#F0C040" : "#FF6B6B";
            const label = score >= 90 ? "Healthy" : score >= 70 ? "Degraded" : "Critical";
            return (
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 32, fontWeight: 800, color }}>{score}</span>
                  <span style={{ fontSize: 14, color, fontWeight: 600 }}>{label}</span>
                </div>
                <BarFill value={score} max={100} color={color} />
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>
                  {overview.success_rate_7d}% success rate · {overview.avg_cost_credits_7d}cr avg cost
                </p>
              </div>
            );
          })()}
        </div>
      </div>

    </div>
  );
}
