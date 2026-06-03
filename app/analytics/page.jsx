"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import * as Q from "@/lib/db/query";
import { SCHEMA } from "@/lib/db/schema";
import AnimatedBackground from "@/components/AnimatedBackground";

// Mirror of server-side CREDIT_COSTS — used to compute credit spend from action_type
const CREDIT_COSTS = {
  image_standard: 3, image_hd: 6,
  voice_30s: 3, voice_60s: 6, voice_1min: 6,
  video_30s: 20, video_60s: 40,
  avatar_30s: 40, avatar_60s: 80,
  lipsync: 20,
};

const ACTION_CATEGORY = {
  image_standard: "Images", image_hd: "Images",
  voice_30s: "Voice", voice_60s: "Voice", voice_1min: "Voice",
  video_30s: "Video", video_60s: "Video",
  avatar_30s: "Avatar", avatar_60s: "Avatar", lipsync: "Avatar",
};

const CATEGORY_COLORS = {
  Scripts: "#7C3AED",
  Images:  "#3B82F6",
  Voice:   "#06B6D4",
  Video:   "#F97316",
  Avatar:  "#C9A84C",
};

const TOOL_MAP = {
  Images: { label: "Image Generator", emoji: "🖼️" },
  Voice:  { label: "Voice Studio",    emoji: "🎙️" },
  Video:  { label: "Video Creator",   emoji: "🎬" },
  Avatar: { label: "Avatar Studio",   emoji: "👤" },
};

const GOLD  = "#CFA42F";
const SUB   = "rgba(224,208,255,0.6)";
const CARD  = "rgba(75,30,130,0.65)";
const BDR   = "rgba(207,164,47,0.2)";

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-AU", { month: "short", day: "numeric" });
}

function StatCard({ label, value, color, sub }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BDR}`, borderRadius: 16, padding: "24px 20px", textAlign: "center", backdropFilter: "blur(12px)" }}>
      <div style={{ fontSize: "clamp(1.8rem,4vw,2.5rem)", fontWeight: 800, color: color ?? "#fff", lineHeight: 1, marginBottom: 8 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: SUB, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: 11, color: "rgba(224,208,255,0.35)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function DonutChart({ segments, total }) {
  if (!total) return <div style={{ width: 140, height: 140, borderRadius: "50%", background: "rgba(75,30,130,0.4)", border: "1px solid rgba(207,164,47,0.2)" }} />;
  const r = 50;
  const circ = 2 * Math.PI * r;

  // Pre-compute per-segment values outside JSX to avoid render-phase mutation
  const segmentData = (() => {
    const result = [];
    let off = -circ / 4; // start at top
    for (const seg of segments) {
      const dash = (seg.value / total) * circ;
      result.push({ offset: off, dash, gap: circ - dash, color: seg.color });
      off -= dash;
    }
    return result;
  })();

  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      {segmentData.map(({ offset, dash, gap, color }, i) => (
        <circle
          key={i}
          cx="70" cy="70" r={r}
          fill="none"
          stroke={color}
          strokeWidth="20"
          strokeDasharray={`${dash} ${gap}`}
          strokeDashoffset={offset}
          strokeLinecap="butt"
        />
      ))}
      <circle cx="70" cy="70" r="38" fill="rgba(13,0,16,0.85)" />
      <text x="70" y="74" textAnchor="middle" fill={GOLD} fontSize="13" fontWeight="700">
        {segments.length} types
      </text>
    </svg>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();

  const [loading, setLoading]             = useState(true);
  const [creditBalance, setCreditBalance] = useState(null);
  const [plan, setPlan]                   = useState("Free");
  const [memberSince, setMemberSince]     = useState(null);
  const [usageLogs, setUsageLogs]         = useState([]);
  const [renders, setRenders]             = useState([]);
  const [historyPage, setHistoryPage]     = useState(1);
  const PER_PAGE = 20;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/signin"); return; }
      const uid = session.user.id;

      const [profileRes, creditsRes, logsRes, rendersRes] = await Promise.all([
        Q.profiles(supabase).byId(uid),
        Q.credits(supabase).forUser(uid),
        supabase.from(SCHEMA.usageLogs.table)
          .select("action_type, estimated_cost_usd, created_at")
          .eq(SCHEMA.usageLogs.columns.userId, uid)
          .order(SCHEMA.usageLogs.columns.createdAt, { ascending: false }),
        Q.renders(supabase).forUser(uid).order(SCHEMA.renders.columns.createdAt, { ascending: false }),
      ]);

      if (cancelled) return;
      setPlan(profileRes.data?.plan ?? "Free");
      setMemberSince(profileRes.data?.created_at ?? null);
      setCreditBalance(creditsRes.data?.balance ?? 0);
      setUsageLogs(logsRes.data ?? []);
      setRenders(rendersRes.data ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [router]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const logsThisMonth = usageLogs.filter(l => new Date(l.created_at) >= monthStart).length;

  const totalCreditsUsed = usageLogs.reduce((sum, l) => sum + (CREDIT_COSTS[l.action_type] ?? 0), 0);

  const daysSince = memberSince
    ? Math.max(1, (now - new Date(memberSince)) / 86400000)
    : 1;

  const avgDaily = totalCreditsUsed / daysSince;
  const daysRemaining = avgDaily > 0 && creditBalance != null ? creditBalance / avgDaily : null;

  // Last 30 days bar chart
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (29 - i));
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  });

  const byDate = usageLogs.reduce((acc, l) => {
    const date = new Date(l.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
    acc[date] = (acc[date] ?? 0) + (CREDIT_COSTS[l.action_type] ?? 0);
    return acc;
  }, {});

  const chartData = last30.map(d => ({ date: d, credits: byDate[d] ?? 0 }));
  const maxCredits = Math.max(...chartData.map(d => d.credits), 1);

  // Category breakdown
  const catTotals = usageLogs.reduce((acc, l) => {
    const cat = ACTION_CATEGORY[l.action_type] ?? "Scripts";
    acc[cat] = (acc[cat] ?? 0) + (CREDIT_COSTS[l.action_type] ?? 0);
    return acc;
  }, {});
  const catTotal = Object.values(catTotals).reduce((a, b) => a + b, 0);
  const catSegments = Object.entries(catTotals).map(([k, v]) => ({ label: k, value: v, color: CATEGORY_COLORS[k] ?? "#7C3AED" }));

  // Tool ranking
  const toolCounts = usageLogs.reduce((acc, l) => {
    const cat = ACTION_CATEGORY[l.action_type];
    if (cat) acc[cat] = (acc[cat] ?? 0) + 1;
    return acc;
  }, {});
  const toolRanked = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]);
  const maxToolCount = toolRanked[0]?.[1] ?? 1;

  // History paginated
  const historySlice = renders.slice(0, historyPage * PER_PAGE);
  const hasMoreHistory = renders.length > historyPage * PER_PAGE;

  const isEmpty = !loading && usageLogs.length === 0 && renders.length === 0;

  return (
    <div style={{ minHeight: "100vh", position: "relative", color: "#fff", fontFamily: '"Instrument Sans","Inter",-apple-system,sans-serif' }}>
      <AnimatedBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
        <main style={{ maxWidth: 1000, margin: "0 auto", padding: "48px 24px 80px" }}>

          {/* Title */}
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h1 style={{ fontSize: "clamp(1.8rem,4vw,2.75rem)", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", background: "linear-gradient(105deg,#CFA42F,#F7D96B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", margin: "0 0 10px" }}>
              My Analytics
            </h1>
            <p style={{ color: SUB, fontSize: "1rem", margin: 0 }}>
              Track your content performance and credit usage
            </p>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "80px 0", color: SUB }}>Loading your data…</div>
          ) : isEmpty ? (
            /* ── Empty state ── */
            <div style={{ textAlign: "center", padding: "80px 24px", background: CARD, border: `1px solid ${BDR}`, borderRadius: 24, backdropFilter: "blur(12px)" }}>
              <div style={{ fontSize: 64, marginBottom: 20 }}>📊</div>
              <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10, color: "#fff" }}>No data yet</h2>
              <p style={{ color: SUB, marginBottom: 28, maxWidth: 360, margin: "0 auto 28px" }}>
                Start creating to see your analytics here — every generation is tracked automatically.
              </p>
              <Link href="/create" style={{ display: "inline-block", padding: "14px 36px", borderRadius: 9999, background: "linear-gradient(105deg,#5A3400,#9A7010,#CFA42F,#E8C84A,#CFA42F,#9A7010,#5A3400)", backgroundSize: "200% auto", animation: "metalShimmer 3s linear infinite", color: "#0D0010", fontWeight: 700, fontSize: 15, textDecoration: "none" }}>
                Start Creating →
              </Link>
            </div>
          ) : (
            <>
              {/* ══ SECTION 1: STATS BAR ══ */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16, marginBottom: 48 }}>
                <StatCard label="Credits Remaining" value={creditBalance ?? "—"} color={GOLD} />
                <StatCard label="Total Generations" value={renders.length} color="#A78BFA" />
                <StatCard label="Actions This Month" value={logsThisMonth} color="#22D3EE" />
                <StatCard
                  label="Member Since"
                  value={memberSince ? new Date(memberSince).toLocaleDateString("en-AU", { month: "short", year: "numeric" }) : "—"}
                  color="#fff"
                  sub={plan.charAt(0).toUpperCase() + plan.slice(1) + " plan"}
                />
              </div>

              {/* ══ SECTION 2: CREDIT USAGE CHART ══ */}
              <section style={{ background: CARD, border: `1px solid ${BDR}`, borderRadius: 20, padding: "28px 28px 20px", marginBottom: 32, backdropFilter: "blur(12px)" }}>
                <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: GOLD, margin: "0 0 24px" }}>
                  Credit Usage — Last 30 Days
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {chartData.filter((_, i) => i % 3 === 2).map(({ date, credits }) => (
                    <div key={date} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 10, color: SUB, width: 52, textAlign: "right", flexShrink: 0 }}>{date}</span>
                      <div style={{ flex: 1, height: 10, background: "rgba(255,255,255,0.06)", borderRadius: 5, overflow: "hidden" }}>
                        <div style={{ width: `${(credits / maxCredits) * 100}%`, height: "100%", background: credits > 0 ? `linear-gradient(90deg,${GOLD},#E8C84A)` : "transparent", borderRadius: 5, transition: "width 0.4s ease" }} />
                      </div>
                      <span style={{ fontSize: 11, color: credits > 0 ? GOLD : "rgba(255,255,255,0.2)", fontWeight: 600, width: 28, textAlign: "right", flexShrink: 0 }}>{credits || ""}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 16, textAlign: "right", fontSize: 12, color: SUB }}>
                  Total used: <span style={{ color: GOLD, fontWeight: 700 }}>{totalCreditsUsed} cr</span>
                </div>
              </section>

              {/* ══ SECTION 3: USAGE BREAKDOWN ══ */}
              {catSegments.length > 0 && (
                <section style={{ background: CARD, border: `1px solid ${BDR}`, borderRadius: 20, padding: 28, marginBottom: 32, backdropFilter: "blur(12px)" }}>
                  <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: GOLD, margin: "0 0 24px" }}>
                    Usage Breakdown by Type
                  </h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 40, flexWrap: "wrap" }}>
                    <DonutChart segments={catSegments} total={catTotal} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minWidth: 200 }}>
                      {catSegments.map(seg => (
                        <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 12, height: 12, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 14, color: "#fff", flex: 1 }}>{seg.label}</span>
                          <span style={{ fontSize: 13, color: seg.color, fontWeight: 700, minWidth: 40, textAlign: "right" }}>
                            {catTotal > 0 ? Math.round((seg.value / catTotal) * 100) : 0}%
                          </span>
                          <span style={{ fontSize: 12, color: SUB, minWidth: 48, textAlign: "right" }}>
                            {seg.value} cr
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* ══ SECTION 4: GENERATION HISTORY TABLE ══ */}
              <section style={{ background: CARD, border: `1px solid ${BDR}`, borderRadius: 20, padding: 28, marginBottom: 32, backdropFilter: "blur(12px)" }}>
                <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: GOLD, margin: "0 0 20px" }}>
                  Generation History
                </h2>
                {renders.length === 0 ? (
                  <p style={{ color: SUB, fontSize: 14 }}>No generations yet.</p>
                ) : (
                  <>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr>
                            {["Type", "Template", "Status", "Date"].map(h => (
                              <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, color: SUB, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid rgba(207,164,47,0.12)" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {historySlice.map(r => {
                            const tmpl = r.template ?? r.director_settings?.template ?? "general";
                            const isComplete = r.status === "complete" || r.status === "completed";
                            const isFailed = r.status === "failed" || r.status === "error";
                            return (
                              <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                <td style={{ padding: "12px 12px" }}>
                                  <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)", color: "#A78BFA", fontSize: 11, fontWeight: 600 }}>
                                    Video
                                  </span>
                                </td>
                                <td style={{ padding: "12px 12px", color: "#fff", textTransform: "capitalize" }}>
                                  {tmpl.replace(/-/g, " ")}
                                </td>
                                <td style={{ padding: "12px 12px" }}>
                                  {isComplete ? (
                                    <span style={{ color: "#4ECB8C", fontWeight: 600 }}>✓ Complete</span>
                                  ) : isFailed ? (
                                    <span style={{ color: "#f87171" }}>✗ Failed</span>
                                  ) : (
                                    <span style={{ color: "#F59E0B" }}>⟳ Processing</span>
                                  )}
                                </td>
                                <td style={{ padding: "12px 12px", color: SUB }}>
                                  {timeAgo(r.created_at)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {hasMoreHistory && (
                      <button onClick={() => setHistoryPage(p => p + 1)}
                        style={{ marginTop: 16, padding: "9px 24px", borderRadius: 9999, border: "1px solid rgba(207,164,47,0.3)", background: "rgba(207,164,47,0.08)", color: GOLD, cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}>
                        Load more
                      </button>
                    )}
                  </>
                )}
              </section>

              {/* ══ SECTION 5: MOST USED TOOLS ══ */}
              {toolRanked.length > 0 && (
                <section style={{ background: CARD, border: `1px solid ${BDR}`, borderRadius: 20, padding: 28, marginBottom: 32, backdropFilter: "blur(12px)" }}>
                  <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: GOLD, margin: "0 0 20px" }}>
                    Most Used Tools
                  </h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {toolRanked.map(([cat, count], i) => {
                      const tool = TOOL_MAP[cat] ?? { label: cat, emoji: "⚙️" };
                      return (
                        <div key={cat} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <span style={{ fontSize: 13, color: SUB, fontWeight: 700, width: 18, textAlign: "right", flexShrink: 0 }}>
                            {i + 1}
                          </span>
                          <span style={{ fontSize: 18, flexShrink: 0 }}>{tool.emoji}</span>
                          <span style={{ fontSize: 14, color: "#fff", fontWeight: 600, flex: 1 }}>{tool.label}</span>
                          <div style={{ width: 160, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${(count / maxToolCount) * 100}%`, height: "100%", background: CATEGORY_COLORS[cat] ?? GOLD, borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 13, color: CATEGORY_COLORS[cat] ?? GOLD, fontWeight: 700, width: 48, textAlign: "right", flexShrink: 0 }}>
                            {count} use{count !== 1 ? "s" : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ══ SECTION 6: CREDIT PROJECTION ══ */}
              <section style={{ background: CARD, border: `1px solid ${BDR}`, borderRadius: 20, padding: 28, backdropFilter: "blur(12px)" }}>
                <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: GOLD, margin: "0 0 20px" }}>
                  Credit Projection
                </h2>
                {daysRemaining === null || avgDaily === 0 ? (
                  <p style={{ color: SUB, fontSize: 14 }}>Not enough usage data for a projection yet. Start creating!</p>
                ) : (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <p style={{ color: "rgba(255,255,255,0.85)", lineHeight: 1.65, margin: "0 0 8px", fontSize: 15 }}>
                        At your current usage rate{" "}
                        <span style={{ color: GOLD, fontWeight: 700 }}>({avgDaily.toFixed(1)} cr/day)</span>
                        {", "}your credits will last approximately{" "}
                        <span style={{
                          fontWeight: 800,
                          fontSize: 18,
                          color: daysRemaining > 14 ? "#4ECB8C" : daysRemaining > 7 ? "#F59E0B" : "#f87171",
                        }}>
                          {Math.round(daysRemaining)} day{Math.round(daysRemaining) !== 1 ? "s" : ""}
                        </span>.
                      </p>
                      {daysRemaining < 7 && (
                        <Link href="/dashboard/credits" style={{ display: "inline-block", marginTop: 12, padding: "10px 24px", borderRadius: 9999, background: "linear-gradient(105deg,#5A3400,#9A7010,#CFA42F,#E8C84A,#CFA42F,#9A7010,#5A3400)", backgroundSize: "200% auto", animation: "metalShimmer 3s linear infinite", color: "#0D0010", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
                          Upgrade →
                        </Link>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      {[
                        { label: "Balance",    value: `${creditBalance} cr`, color: GOLD },
                        { label: "Total Used", value: `${totalCreditsUsed} cr`, color: "#A78BFA" },
                        { label: "Avg/Day",    value: `${avgDaily.toFixed(1)} cr`, color: "#22D3EE" },
                      ].map(item => (
                        <div key={item.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "14px 18px", textAlign: "center", minWidth: 90 }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: item.color, marginBottom: 4 }}>{item.value}</div>
                          <div style={{ fontSize: 11, color: SUB, textTransform: "uppercase", letterSpacing: "0.07em" }}>{item.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>

      <style>{`
        @keyframes metalShimmer { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
      `}</style>
    </div>
  );
}
