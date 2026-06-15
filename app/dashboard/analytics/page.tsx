"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";
import AnimatedBackground from "@/components/AnimatedBackground";

const supabase = createClient();

interface Stats {
  creditsRemaining: number;
  totalGenerations: number;
  actionsThisMonth: number;
  memberSince:      string;
  plan:             string;
}

const TEMPLATE_COLORS: Record<string, string> = {
  cinematic: "#A855F7",
  avatar:    "#22D3EE",
  story:     "#FBBF24",
};

function templateColor(name: string) {
  return TEMPLATE_COLORS[name.toLowerCase()] ?? "#C084FC";
}

const CARD = {
  background:     "linear-gradient(135deg, rgba(75,30,130,0.8), rgba(55,20,100,0.9))",
  backdropFilter: "blur(16px)",
  border:         "1px solid rgba(207,164,47,0.2)",
  borderRadius:   24,
  padding:        "2rem",
} as const;

const CHART_CARD = {
  background:   "#1A1428",
  borderRadius: 24,
  padding:      "2rem",
} as const;

const TOOLTIP_STYLE = {
  background:   "#1A1428",
  border:       "1px solid rgba(207,164,47,0.25)",
  borderRadius: 8,
  fontSize:     12,
  color:        "#E8DEFF",
} as const;

export default function AnalyticsPage() {
  const [stats,          setStats]          = useState<Stats | null>(null);
  const [retentionTrend, setRetentionTrend] = useState<{ date: string; retention: number }[]>([]);
  const [creditUsage,    setCreditUsage]    = useState<{ day: string; used: number }[]>([]);
  const [templateData,   setTemplateData]   = useState<{ name: string; value: number; color: string }[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load(isRefresh = false) {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);

    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) throw new Error("Not authenticated");

      const uid = user.id;
      const now = new Date();
      const startOfMonth  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const sevenDaysAgo  = new Date(now.getTime() - 7  * 86_400_000).toISOString();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();

      const [creditsRes, profileRes, rendersRes, usageCountRes, txnRes, scoresRes] =
        await Promise.all([
          supabase.from("credits").select("balance").eq("user_id", uid).single(),
          supabase.from("profiles").select("plan, created_at").eq("id", uid).single(),
          supabase.from("renders").select("template, created_at").eq("user_id", uid),
          supabase.from("usage_logs")
            .select("id", { count: "exact", head: true })
            .eq("user_id", uid)
            .gte("created_at", startOfMonth),
          supabase.from("credit_transactions")
            .select("amount, created_at")
            .eq("user_id", uid)
            .lt("amount", 0)
            .gte("created_at", sevenDaysAgo)
            .order("created_at", { ascending: true }),
          supabase.from("content_scores")
            .select("completion_rate, recalculated_at")
            .eq("user_id", uid)
            .gte("recalculated_at", thirtyDaysAgo)
            .order("recalculated_at", { ascending: true }),
        ]);

      // ── Stats ────────────────────────────────────────────────────────────────
      const memberDate = (profileRes.data?.created_at ?? user.created_at)
        ? new Date(profileRes.data?.created_at ?? user.created_at!).toLocaleDateString("en-AU", { month: "long", year: "numeric" })
        : "—";

      setStats({
        creditsRemaining: creditsRes.data?.balance ?? 0,
        totalGenerations: rendersRes.data?.length  ?? 0,
        actionsThisMonth: usageCountRes.count       ?? 0,
        memberSince:      memberDate,
        plan:             profileRes.data?.plan     ?? "free",
      });

      // ── Retention trend — daily avg completion rate (%) ──────────────────────
      const scores = scoresRes.data ?? [];
      if (scores.length > 0) {
        const byDay = new Map<string, number[]>();
        for (const s of scores) {
          const day = new Date(s.recalculated_at).toLocaleDateString("en-AU", { month: "short", day: "numeric" });
          const pct = Math.round(+(s.completion_rate) * 100);
          const bucket = byDay.get(day) ?? [];
          bucket.push(pct);
          byDay.set(day, bucket);
        }
        setRetentionTrend(
          Array.from(byDay.entries()).map(([date, vals]) => ({
            date,
            retention: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
          }))
        );
      } else {
        setRetentionTrend([]);
      }

      // ── Credit usage per day — last 7 days ───────────────────────────────────
      const dayMap = new Map<string, number>();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86_400_000);
        dayMap.set(d.toLocaleDateString("en-AU", { month: "short", day: "numeric" }), 0);
      }
      for (const tx of txnRes.data ?? []) {
        const key = new Date(tx.created_at).toLocaleDateString("en-AU", { month: "short", day: "numeric" });
        if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + Math.abs(tx.amount));
      }
      setCreditUsage(Array.from(dayMap.entries()).map(([day, used]) => ({ day, used })));

      // ── Template breakdown ────────────────────────────────────────────────────
      const tplMap = new Map<string, number>();
      for (const r of rendersRes.data ?? []) {
        const t = r.template ?? "Cinematic";
        tplMap.set(t, (tplMap.get(t) ?? 0) + 1);
      }
      setTemplateData(
        Array.from(tplMap.entries()).map(([name, value]) => ({ name, value, color: templateColor(name) }))
      );

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // ── Loading skeleton ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0F0A1F", color: "#E8DEFF", position: "relative" }}>
        <AnimatedBackground />
        <div style={{ position: "relative", zIndex: 1, padding: "2rem 2rem 6rem", maxWidth: 1200, margin: "0 auto" }}>
          <div className="animate-pulse" style={{ height: 48, width: 320, background: "rgba(168,85,247,0.2)", borderRadius: 12, marginBottom: 12 }} />
          <div className="animate-pulse" style={{ height: 22, width: 460, background: "rgba(168,85,247,0.1)", borderRadius: 8, marginBottom: 48 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 24, marginBottom: 40 }}>
            {[0,1,2].map(i => <div key={i} className="animate-pulse" style={{ background: "rgba(75,30,130,0.4)", borderRadius: 24, height: 140 }} />)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 32, marginBottom: 32 }}>
            <div className="animate-pulse" style={{ background: "rgba(26,20,40,0.8)", borderRadius: 24, height: 340 }} />
            <div className="animate-pulse" style={{ background: "rgba(26,20,40,0.8)", borderRadius: 24, height: 340 }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 32 }}>
            <div className="animate-pulse" style={{ background: "rgba(26,20,40,0.8)", borderRadius: 24, height: 300 }} />
            <div className="animate-pulse" style={{ background: "rgba(75,30,130,0.4)", borderRadius: 24, height: 300 }} />
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "#0F0A1F", color: "#E8DEFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "#F87171", fontSize: 18, marginBottom: 16 }}>⚠ {error}</p>
          <button
            onClick={() => load()}
            style={{ padding: "12px 24px", background: "#7C3AED", border: "none", borderRadius: 12, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600 }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const planLabel = stats?.plan
    ? stats.plan.charAt(0).toUpperCase() + stats.plan.slice(1)
    : "Free";

  return (
    <div style={{ minHeight: "100vh", background: "#0F0A1F", color: "#E8DEFF", position: "relative" }}>
      <AnimatedBackground />
      <div style={{ position: "relative", zIndex: 1, padding: "clamp(1rem,4vw,2rem) clamp(1rem,4vw,2rem) 6rem", maxWidth: 1200, margin: "0 auto" }}>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 40, flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontSize: "clamp(2rem,5vw,3.5rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: 0, lineHeight: 1.1 }}>
              MY ANALYTICS
            </h1>
            <p style={{ fontSize: 17, color: "#9CA3AF", marginTop: 8, marginBottom: 0 }}>
              Track your content performance and credit usage
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "12px 20px",
              background: "rgba(124,58,237,0.55)",
              border: "1px solid rgba(124,58,237,0.5)",
              borderRadius: 14, color: "#E8DEFF",
              fontSize: 13, fontWeight: 600, cursor: refreshing ? "not-allowed" : "pointer",
              opacity: refreshing ? 0.6 : 1, transition: "opacity 0.2s",
              fontFamily: "inherit",
            }}
          >
            <span style={{ display: "inline-block", animation: refreshing ? "spin 1s linear infinite" : "none", fontSize: 16 }}>⟳</span>
            {refreshing ? "Refreshing…" : "Refresh Data"}
          </button>
        </div>

        {/* ── Stat cards ─────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24, marginBottom: 40 }}>
          {[
            { label: "CREDITS REMAINING", value: stats?.creditsRemaining ?? 0, color: "#FBBF24" },
            { label: "TOTAL GENERATIONS", value: stats?.totalGenerations  ?? 0, color: "#FFFFFF" },
            { label: "ACTIONS THIS MONTH", value: stats?.actionsThisMonth ?? 0, color: "#22D3EE" },
          ].map(({ label, value, color }) => (
            <div key={label} style={CARD}>
              <div style={{ fontSize: "clamp(2.5rem,6vw,4rem)", fontWeight: 800, color, marginBottom: 8, lineHeight: 1 }}>
                {value}
              </div>
              <div style={{ fontSize: 11, letterSpacing: "0.15em", color: "#9CA3AF" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* ── Charts row ─────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 32, marginBottom: 32 }}>

          {/* Retention trend line chart */}
          <div style={CHART_CARD}>
            <h3 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.15em", margin: "0 0 24px", color: "#E8DEFF" }}>
              RETENTION TREND
            </h3>
            {retentionTrend.length > 0 ? (
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={retentionTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2D1F4A" />
                    <XAxis dataKey="date" stroke="#6B7280" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                    <YAxis domain={[0, 100]} stroke="#6B7280" tick={{ fontSize: 11, fill: "#9CA3AF" }} unit="%" />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Line type="monotone" dataKey="retention" stroke="#C084FC" strokeWidth={3} dot={{ fill: "#E0ABFF", r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div style={{ height: 280, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "#4B3F6B" }}>
                <div style={{ fontSize: 36 }}>📊</div>
                <div style={{ fontSize: 13, color: "#6B7280" }}>No performance data yet</div>
                <div style={{ fontSize: 11, color: "#4B3F6B", textAlign: "center" }}>Populates after videos receive views</div>
              </div>
            )}
          </div>

          {/* Credit usage bar chart */}
          <div style={CHART_CARD}>
            <h3 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.15em", margin: "0 0 24px", color: "#E8DEFF" }}>
              CREDIT USAGE — LAST 7 DAYS
            </h3>
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={creditUsage}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2D1F4A" />
                  <XAxis dataKey="day" stroke="#6B7280" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                  <YAxis stroke="#6B7280" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="used" fill="#A855F7" radius={[6, 6, 0, 0]} name="Credits" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── Bottom row ─────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 32 }}>

          {/* Template breakdown */}
          <div style={CHART_CARD}>
            <h3 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.15em", margin: "0 0 24px", color: "#E8DEFF" }}>
              TEMPLATE PERFORMANCE
            </h3>
            {templateData.length > 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
                <div style={{ flex: "0 0 220px", height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={templateData} cx="50%" cy="50%" innerRadius={60} outerRadius={95} dataKey="value" paddingAngle={4}>
                        {templateData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {templateData.map(t => (
                    <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 160 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: "#D4CCDF", flex: 1 }}>{t.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#E8DEFF" }}>{t.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ height: 220, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "#4B3F6B" }}>
                <div style={{ fontSize: 36 }}>🎬</div>
                <div style={{ fontSize: 13, color: "#6B7280" }}>No completed renders yet</div>
              </div>
            )}
          </div>

          {/* Member info card */}
          <div style={{
            background: "linear-gradient(135deg, rgba(75,30,130,0.6), rgba(45,10,70,0.9))",
            border: "1px solid rgba(124,58,237,0.4)",
            borderRadius: 24, padding: "2rem",
            display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 24,
          }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.15em", color: "#9CA3AF", marginBottom: 10 }}>
                MEMBER SINCE
              </div>
              <div style={{ fontSize: "clamp(1.1rem, 2.5vw, 1.7rem)", fontWeight: 800, lineHeight: 1.2 }}>
                {stats?.memberSince ?? "—"}
              </div>
            </div>
            <div>
              <div style={{
                background: "rgba(124,58,237,0.45)",
                border: "1px solid rgba(124,58,237,0.45)",
                borderRadius: 14, padding: "14px 20px",
                textAlign: "center", fontSize: 17, fontWeight: 700,
                color: "#E8DEFF", marginBottom: 10,
              }}>
                {planLabel} Plan
              </div>
              <a
                href="/dashboard/credits"
                style={{ display: "block", textAlign: "center", fontSize: 12, color: "#F0C040", textDecoration: "none" }}
              >
                View plans →
              </a>
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
