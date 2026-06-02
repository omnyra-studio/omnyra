"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AnimatedBackground from "@/components/AnimatedBackground";

// ── Types ────────────────────────────────────────────────────────────────────

interface Insight {
  category: string;
  headline: string;
  detail: string;
  action: string;
  priority: "high" | "medium" | "low";
}

interface AnalyticsPayload {
  context: {
    brandName: string | null;
    niche: string | null;
    targetAudience: string | null;
    toneOfVoice: string | null;
    contentPillars: string[];
    preferredHooks: string[];
    qualityScore: number;
    totalVideos: number;
    publishRate: number;
    topHooks: Array<{ hook: string; publishRate: number }>;
    topTemplates: Array<{ template: string; publishRate: number }>;
    hasEnoughHistory: boolean;
    bestSettings: {
      hookType: string | null;
      energy: number;
      pacing: string | null;
      template: string | null;
    };
  };
  history: {
    totalGenerations: number;
    publishRate: number;
    editRate: number;
    avgRating: number;
    topHooks: Array<{ hook: string; count: number; publishRate: number }>;
    topTemplates: Array<{ template: string; count: number; publishRate: number }>;
  };
  bestSettings: {
    bestHookType: string | null;
    bestEnergy: number;
    bestPacing: string;
    bestTemplate: string | null;
    topNiches: string[];
    confidence: "low" | "medium" | "high";
  };
  weights: {
    hookWeights: Record<string, number>;
    energyWeights: Record<string, number>;
    pacingWeights: Record<string, number>;
    templateWeights: Record<string, number>;
    topNiches: string[];
  };
  performanceLeaks: Array<{ type: string; key: string; publishRate: number; count: number }>;
  contentGaps: string[];
  energyChart: Array<{ level: number; count: number }>;
  creditsUsedThisMonth: number;
  creditsRemaining: number | null;
  roiPublishRate: number;
  weekGenerations: number;
  weekPublished: number;
  insights: {
    insights: Insight[];
    dailyBrief: string;
    generatedAt: string;
  } | null;
}

// ── Style constants ───────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: "rgba(75,30,130,0.75)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(207,164,47,0.2)",
  borderRadius: "16px",
  padding: "24px",
  marginBottom: "24px",
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 700,
  color: "#FFFFFF",
  marginBottom: "16px",
  letterSpacing: "0.04em",
  textTransform: "uppercase" as const,
};

const LABEL: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "rgba(224,208,255,0.5)",
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
};

const GOLD = "#CFA42F";
const GOLD_DIM = "rgba(207,164,47,0.65)";
const PURPLE_SOFT = "rgba(224,208,255,0.7)";

function pct(n: number) { return `${Math.round(n * 100)}%`; }
function fmt(n: number) { return n.toFixed(0); }

// ── Sub-components ────────────────────────────────────────────────────────────

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: "rgba(45,10,62,0.5)",
      border: "1px solid rgba(207,164,47,0.15)",
      borderRadius: "12px",
      padding: "16px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: "11px", fontWeight: 600, color: "rgba(224,208,255,0.5)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "6px" }}>{label}</div>
      <div style={{ fontSize: "22px", fontWeight: 700, color: "#fff" }}>{value}</div>
      {sub && <div style={{ fontSize: "12px", color: GOLD_DIM, marginTop: "2px" }}>{sub}</div>}
    </div>
  );
}

function BarRow({ label, value, max, color = GOLD }: { label: string; value: number; max: number; color?: string }) {
  const pctWidth = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
        <span style={{ fontSize: "13px", color: PURPLE_SOFT }}>{label}</span>
        <span style={{ fontSize: "13px", fontWeight: 600, color }}>{pct(value)}</span>
      </div>
      <div style={{ height: "6px", borderRadius: "3px", background: "rgba(45,10,62,0.6)" }}>
        <div style={{ height: "100%", width: `${pctWidth}%`, borderRadius: "3px", background: color, transition: "width 0.8s ease" }} />
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: "high" | "medium" | "low" }) {
  const cfg = {
    high:   { bg: "rgba(248,113,113,0.15)", border: "rgba(248,113,113,0.4)", text: "#f87171" },
    medium: { bg: "rgba(207,164,47,0.15)",  border: "rgba(207,164,47,0.4)",  text: GOLD },
    low:    { bg: "rgba(78,203,140,0.12)",  border: "rgba(78,203,140,0.3)",  text: "#4ECB8C" },
  }[priority];
  return (
    <span style={{
      fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
      padding: "2px 8px", borderRadius: "9999px",
      background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text,
    }}>{priority}</span>
  );
}

function CategoryIcon({ category }: { category: string }) {
  const icons: Record<string, string> = {
    hook: "🎣", energy: "⚡", template: "📐", content_gap: "🕳️", growth: "📈",
  };
  return <span>{icons[category] ?? "💡"}</span>;
}

function WeightBar({ weights, label }: { weights: Record<string, number>; label: string }) {
  const entries = Object.entries(weights).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!entries.length) return <div style={{ color: "rgba(224,208,255,0.3)", fontSize: "13px" }}>No data yet</div>;
  const max = Math.max(...entries.map((e) => e[1]));
  return (
    <div>
      <div style={LABEL}>{label}</div>
      <div style={{ marginTop: "10px" }}>
        {entries.map(([key, val]) => (
          <BarRow key={key} label={key} value={val} max={max} />
        ))}
      </div>
    </div>
  );
}

function EnergyChart({ data }: { data: Array<{ level: number; count: number }> }) {
  if (!data.length) return <div style={{ color: "rgba(224,208,255,0.3)", fontSize: "13px" }}>No data yet</div>;
  const maxCount = Math.max(...data.map((d) => d.count));
  const ENERGY_LABELS = ["", "Calm", "Mild", "Balanced", "Dynamic", "Intense"];
  return (
    <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", height: "80px" }}>
      {[1, 2, 3, 4, 5].map((level) => {
        const d = data.find((e) => e.level === level);
        const count = d?.count ?? 0;
        const heightPct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
        return (
          <div key={level} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
            <div style={{ fontSize: "10px", color: GOLD_DIM }}>{count > 0 ? count : ""}</div>
            <div style={{
              width: "100%", height: `${Math.max(heightPct * 0.6, count > 0 ? 4 : 2)}px`,
              background: count > 0 ? `rgba(207,164,47,${0.3 + heightPct * 0.005})` : "rgba(45,10,62,0.4)",
              borderRadius: "4px 4px 0 0", border: count > 0 ? `1px solid ${GOLD_DIM}` : "none",
              transition: "height 0.6s ease",
            }} />
            <div style={{ fontSize: "10px", color: "rgba(224,208,255,0.4)" }}>{level}</div>
            <div style={{ fontSize: "9px", color: "rgba(224,208,255,0.3)" }}>{ENERGY_LABELS[level]}</div>
          </div>
        );
      })}
    </div>
  );
}

function QualityGauge({ score }: { score: number }) {
  const pctVal = Math.round(score * 100);
  const color = pctVal >= 70 ? "#4ECB8C" : pctVal >= 45 ? GOLD : "#f87171";
  const label = pctVal >= 70 ? "High quality" : pctVal >= 45 ? "Building momentum" : "Early stage";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
      <div style={{ position: "relative", width: "80px", height: "80px" }}>
        <svg viewBox="0 0 80 80" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(45,10,62,0.7)" strokeWidth="8" />
          <circle
            cx="40" cy="40" r="34" fill="none"
            stroke={color} strokeWidth="8"
            strokeDasharray={`${2 * Math.PI * 34}`}
            strokeDashoffset={`${2 * Math.PI * 34 * (1 - score)}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s ease" }}
          />
        </svg>
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: "18px", fontWeight: 700, color }}>{pctVal}</span>
        </div>
      </div>
      <div>
        <div style={{ fontSize: "15px", fontWeight: 700, color }}>{label}</div>
        <div style={{ fontSize: "12px", color: "rgba(224,208,255,0.5)", marginTop: "4px" }}>out of 100</div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IntelligenceDashboard() {
  const router = useRouter();
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/signin"); return; }

      try {
        const res = await fetch("/api/brand-brain/analytics?insights=true");
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        setData(await res.json() as AnalyticsPayload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const noHistory = !data?.context.hasEnoughHistory;

  return (
    <div className="min-h-screen" style={{ position: "relative", background: "transparent" }}>
      <AnimatedBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
        <main className="max-w-4xl mx-auto px-6 py-8">

          {/* Header */}
          <div style={{
            fontSize: "1.5rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
            background: "linear-gradient(105deg,#CFA42F,#F7D96B)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text", marginBottom: "6px",
          }}>
            Creative Intelligence
          </div>
          <p style={{ color: "rgba(224,208,255,0.55)", fontSize: "14px", marginBottom: "32px" }}>
            Your personalised performance report — updated every generation.
          </p>

          {loading && (
            <div style={{ ...CARD, textAlign: "center", padding: "60px 0", color: "rgba(224,208,255,0.5)" }}>
              Loading your creative intelligence…
            </div>
          )}

          {error && (
            <div style={{ ...CARD, borderColor: "rgba(248,113,113,0.4)" }}>
              <p style={{ color: "#f87171", fontSize: "14px" }}>Error: {error}</p>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* ── Section 1: At-a-glance stats ────────────────────────────── */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "12px", marginBottom: "24px" }}>
                <StatTile label="Total Videos" value={String(data.history.totalGenerations)} />
                <StatTile label="Published" value={pct(data.history.publishRate)} sub={`${data.context.totalVideos} live`} />
                <StatTile label="Quality Score" value={fmt(data.context.qualityScore * 100)} sub="/ 100" />
                <StatTile label="This Week" value={String(data.weekGenerations)} sub={`${data.weekPublished} published`} />
                <StatTile label="Credits Used" value={String(data.creditsUsedThisMonth)} sub="this month" />
                {data.creditsRemaining !== null && (
                  <StatTile label="Remaining" value={String(data.creditsRemaining)} sub="credits" />
                )}
              </div>

              {/* ── Section 2: Daily Creative Brief ─────────────────────────── */}
              {data.insights?.dailyBrief && (
                <div style={{ ...CARD, borderColor: "rgba(207,164,47,0.35)", background: "rgba(30,10,55,0.85)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                    <span style={{ fontSize: "18px" }}>📋</span>
                    <div style={SECTION_TITLE}>Today&apos;s Creative Brief</div>
                  </div>
                  <p style={{ fontSize: "15px", color: "#FFFFFF", lineHeight: 1.6, fontStyle: "italic" }}>
                    &ldquo;{data.insights.dailyBrief}&rdquo;
                  </p>
                  <p style={{ fontSize: "11px", color: "rgba(224,208,255,0.35)", marginTop: "10px" }}>
                    Generated {new Date(data.insights.generatedAt).toLocaleString()}
                  </p>
                </div>
              )}

              {/* ── Section 3: Plain-English Insights ───────────────────────── */}
              {data.insights?.insights && data.insights.insights.length > 0 && (
                <div style={CARD}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                    <span style={{ fontSize: "18px" }}>💡</span>
                    <div style={SECTION_TITLE}>Insights</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {data.insights.insights.map((ins, i) => (
                      <div key={i} style={{
                        background: "rgba(45,10,62,0.5)",
                        border: "1px solid rgba(207,164,47,0.12)",
                        borderRadius: "12px",
                        padding: "16px",
                      }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "6px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <CategoryIcon category={ins.category} />
                            <span style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>{ins.headline}</span>
                          </div>
                          <PriorityBadge priority={ins.priority} />
                        </div>
                        <p style={{ fontSize: "13px", color: PURPLE_SOFT, margin: "0 0 8px", lineHeight: 1.5 }}>{ins.detail}</p>
                        <div style={{
                          fontSize: "12px", fontWeight: 600, color: GOLD,
                          background: "rgba(207,164,47,0.08)", border: "1px solid rgba(207,164,47,0.2)",
                          borderRadius: "8px", padding: "8px 12px",
                          display: "inline-flex", alignItems: "center", gap: "6px",
                        }}>
                          <span>→</span> {ins.action}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Section 4: Winning Patterns ──────────────────────────────── */}
              <div style={CARD}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                  <span style={{ fontSize: "18px" }}>🏆</span>
                  <div style={SECTION_TITLE}>Winning Patterns</div>
                </div>
                {noHistory ? (
                  <p style={{ color: "rgba(224,208,255,0.4)", fontSize: "13px" }}>
                    Create and publish at least 3 videos to see your winning patterns.
                  </p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                    <div>
                      <div style={{ ...LABEL, marginBottom: "12px" }}>Top Hooks</div>
                      {data.history.topHooks.length === 0
                        ? <p style={{ color: "rgba(224,208,255,0.3)", fontSize: "13px" }}>No hook data yet</p>
                        : data.history.topHooks.slice(0, 5).map((h) => (
                          <BarRow key={h.hook} label={h.hook} value={h.publishRate} max={1} />
                        ))
                      }
                    </div>
                    <div>
                      <div style={{ ...LABEL, marginBottom: "12px" }}>Top Templates</div>
                      {data.history.topTemplates.length === 0
                        ? <p style={{ color: "rgba(224,208,255,0.3)", fontSize: "13px" }}>No template data yet</p>
                        : data.history.topTemplates.slice(0, 5).map((t) => (
                          <BarRow key={t.template} label={t.template} value={t.publishRate} max={1} />
                        ))
                      }
                    </div>
                  </div>
                )}
              </div>

              {/* ── Section 5: Performance Leaks ─────────────────────────────── */}
              <div style={CARD}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                  <span style={{ fontSize: "18px" }}>🕳️</span>
                  <div style={SECTION_TITLE}>Performance Leaks</div>
                </div>
                {data.performanceLeaks.length === 0 ? (
                  <p style={{ color: "#4ECB8C", fontSize: "13px", fontWeight: 600 }}>
                    No significant leaks detected — your patterns are consistent.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {data.performanceLeaks.map((leak, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.25)",
                        borderRadius: "10px", padding: "12px 16px",
                      }}>
                        <div>
                          <span style={{ fontSize: "11px", fontWeight: 600, color: "rgba(248,113,113,0.7)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{leak.type}</span>
                          <div style={{ fontSize: "14px", color: "#fff", marginTop: "2px" }}>{leak.key}</div>
                          <div style={{ fontSize: "12px", color: "rgba(224,208,255,0.5)", marginTop: "2px" }}>{leak.count} uses</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "22px", fontWeight: 700, color: "#f87171" }}>{pct(leak.publishRate)}</div>
                          <div style={{ fontSize: "11px", color: "rgba(248,113,113,0.6)" }}>publish rate</div>
                        </div>
                      </div>
                    ))}
                    <p style={{ fontSize: "12px", color: "rgba(224,208,255,0.4)", marginTop: "4px" }}>
                      These patterns have been used 3+ times with under 30% publish rate. Consider replacing them.
                    </p>
                  </div>
                )}
              </div>

              {/* ── Section 6: Energy & Pacing ───────────────────────────────── */}
              <div style={{ ...CARD }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                  <span style={{ fontSize: "18px" }}>⚡</span>
                  <div style={SECTION_TITLE}>Energy &amp; Pacing</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                  <div>
                    <div style={{ ...LABEL, marginBottom: "14px" }}>Energy Distribution</div>
                    <EnergyChart data={data.energyChart} />
                    {data.bestSettings.confidence !== "low" && (
                      <div style={{ marginTop: "12px", fontSize: "13px", color: PURPLE_SOFT }}>
                        Best energy: <span style={{ fontWeight: 700, color: GOLD }}>{data.bestSettings.bestEnergy}/5</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{ ...LABEL, marginBottom: "12px" }}>Pacing Preference</div>
                    <WeightBar weights={data.weights.pacingWeights} label="" />
                    {data.bestSettings.bestPacing && (
                      <div style={{ marginTop: "8px", fontSize: "13px", color: PURPLE_SOFT }}>
                        Best pacing: <span style={{ fontWeight: 700, color: GOLD }}>{data.bestSettings.bestPacing}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Section 7: Content Pillars & Gaps ───────────────────────── */}
              <div style={CARD}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                  <span style={{ fontSize: "18px" }}>🎯</span>
                  <div style={SECTION_TITLE}>Content Pillars &amp; Gaps</div>
                </div>
                {data.context.contentPillars.length === 0 ? (
                  <p style={{ color: "rgba(224,208,255,0.4)", fontSize: "13px" }}>
                    Add content pillars in your Creator Profile to see gap analysis.
                  </p>
                ) : (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
                      {data.context.contentPillars.map((p) => {
                        const isGap = data.contentGaps.includes(p);
                        return (
                          <span key={p} style={{
                            padding: "6px 14px", borderRadius: "9999px", fontSize: "13px", fontWeight: 600,
                            background: isGap ? "rgba(248,113,113,0.1)" : "rgba(207,164,47,0.15)",
                            border: `1px solid ${isGap ? "rgba(248,113,113,0.3)" : "rgba(207,164,47,0.4)"}`,
                            color: isGap ? "#f87171" : GOLD,
                          }}>
                            {isGap ? "⚠ " : "✓ "}{p}
                          </span>
                        );
                      })}
                    </div>
                    {data.contentGaps.length > 0 && (
                      <div style={{
                        background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.25)",
                        borderRadius: "10px", padding: "12px 16px",
                      }}>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: "#f87171", marginBottom: "4px" }}>Content Gap Detected</div>
                        <p style={{ fontSize: "13px", color: "rgba(224,208,255,0.65)", margin: 0 }}>
                          You haven&apos;t generated content for: <strong>{data.contentGaps.join(", ")}</strong>. Try creating videos in these pillars to stay consistent.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* ── Section 8: Creator Quality Score ────────────────────────── */}
              <div style={CARD}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
                  <span style={{ fontSize: "18px" }}>🎖️</span>
                  <div style={SECTION_TITLE}>Creator Quality Score</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "24px", alignItems: "center" }}>
                  <QualityGauge score={data.context.qualityScore} />
                  <div>
                    <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                      <div>
                        <div style={LABEL}>Publish Rate</div>
                        <div style={{ fontSize: "18px", fontWeight: 700, color: "#fff", marginTop: "4px" }}>{pct(data.history.publishRate)}</div>
                      </div>
                      <div>
                        <div style={LABEL}>Edit Rate</div>
                        <div style={{ fontSize: "18px", fontWeight: 700, color: "#fff", marginTop: "4px" }}>{pct(data.history.editRate)}</div>
                      </div>
                      {data.history.avgRating > 0 && (
                        <div>
                          <div style={LABEL}>Avg Rating</div>
                          <div style={{ fontSize: "18px", fontWeight: 700, color: "#fff", marginTop: "4px" }}>{data.history.avgRating.toFixed(1)}/5</div>
                        </div>
                      )}
                      <div>
                        <div style={LABEL}>Confidence</div>
                        <div style={{ fontSize: "18px", fontWeight: 700, color: data.bestSettings.confidence === "high" ? "#4ECB8C" : data.bestSettings.confidence === "medium" ? GOLD : "#f87171", marginTop: "4px", textTransform: "capitalize" }}>
                          {data.bestSettings.confidence}
                        </div>
                      </div>
                    </div>
                    <p style={{ fontSize: "12px", color: "rgba(224,208,255,0.4)", marginTop: "12px" }}>
                      Score updates after every video outcome. Publish without editing = maximum signal.
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Section 9: Learning Visualisation ───────────────────────── */}
              <div style={CARD}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                  <span style={{ fontSize: "18px" }}>🧠</span>
                  <div style={SECTION_TITLE}>Learning Visualisation</div>
                </div>
                {noHistory ? (
                  <p style={{ color: "rgba(224,208,255,0.4)", fontSize: "13px" }}>
                    Your preference weights will appear here after 3+ generations.
                  </p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                    <WeightBar weights={data.weights.hookWeights} label="Hook Weights" />
                    <WeightBar weights={data.weights.templateWeights} label="Template Weights" />
                  </div>
                )}
                {data.bestSettings.topNiches.length > 0 && (
                  <div style={{ marginTop: "16px" }}>
                    <div style={{ ...LABEL, marginBottom: "8px" }}>Top Niches Explored</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {data.bestSettings.topNiches.map((n) => (
                        <span key={n} style={{
                          padding: "4px 12px", borderRadius: "9999px", fontSize: "12px",
                          background: "rgba(78,203,140,0.1)", border: "1px solid rgba(78,203,140,0.25)", color: "#4ECB8C",
                        }}>{n}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Section 10: Revenue Intelligence ────────────────────────── */}
              <div style={CARD}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                  <span style={{ fontSize: "18px" }}>💰</span>
                  <div style={SECTION_TITLE}>Revenue Intelligence</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "12px", marginBottom: "16px" }}>
                  <StatTile label="Credits / Month" value={String(data.creditsUsedThisMonth)} />
                  {data.creditsRemaining !== null && (
                    <StatTile label="Balance" value={String(data.creditsRemaining)} sub="credits" />
                  )}
                  <StatTile
                    label="ROI Publish Rate"
                    value={pct(data.roiPublishRate)}
                    sub="of credits → live video"
                  />
                </div>
                <div style={{
                  background: "rgba(45,10,62,0.5)", border: "1px solid rgba(207,164,47,0.15)",
                  borderRadius: "12px", padding: "16px",
                }}>
                  <div style={{ ...LABEL, marginBottom: "8px" }}>Credit Efficiency</div>
                  <div style={{ height: "8px", borderRadius: "4px", background: "rgba(30,5,45,0.7)" }}>
                    <div style={{
                      height: "100%",
                      width: `${Math.round(data.roiPublishRate * 100)}%`,
                      borderRadius: "4px",
                      background: data.roiPublishRate >= 0.5
                        ? "linear-gradient(90deg, #4ECB8C, #2AB074)"
                        : data.roiPublishRate >= 0.3
                        ? `linear-gradient(90deg, ${GOLD}, #9A7010)`
                        : "linear-gradient(90deg, #f87171, #dc2626)",
                      transition: "width 0.8s ease",
                    }} />
                  </div>
                  <p style={{ fontSize: "12px", color: "rgba(224,208,255,0.45)", marginTop: "8px" }}>
                    {data.roiPublishRate >= 0.5
                      ? "Strong ROI — over half your credits produce published content."
                      : data.roiPublishRate >= 0.3
                      ? "Moderate ROI — try refining your hook and template choices."
                      : "Low ROI — explore different hooks, templates, and energy levels to find your winning formula."}
                  </p>
                </div>
              </div>

              {/* No history CTA */}
              {noHistory && (
                <div style={{
                  ...CARD,
                  textAlign: "center",
                  borderColor: "rgba(207,164,47,0.35)",
                  background: "rgba(30,10,55,0.85)",
                  padding: "40px 24px",
                }}>
                  <div style={{ fontSize: "36px", marginBottom: "12px" }}>🚀</div>
                  <div style={{ fontSize: "18px", fontWeight: 700, color: "#fff", marginBottom: "8px" }}>
                    Build your creative history
                  </div>
                  <p style={{ fontSize: "14px", color: "rgba(224,208,255,0.6)", marginBottom: "24px", maxWidth: "400px", margin: "0 auto 24px" }}>
                    Generate at least 3 videos and mark which ones you publish. Your personalised AI intelligence will activate automatically.
                  </p>
                  <a href="/create" style={{
                    display: "inline-block",
                    padding: "12px 32px", borderRadius: "9999px", fontSize: "15px", fontWeight: 700,
                    background: "linear-gradient(105deg, #5A3400 0%, #9A7010 20%, #CFA42F 42%, #E8C84A 50%, #CFA42F 58%, #9A7010 80%, #5A3400 100%)",
                    backgroundSize: "200% auto",
                    color: "#0D0010", textDecoration: "none",
                    boxShadow: "0 0 24px rgba(207,164,47,0.35)",
                  }}>
                    Start Creating
                  </a>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
