"use client";

import { useEffect, useState } from "react";
import type { AnalyticsData } from "@/app/api/analytics/route";

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ToolLabel({ tool }: { tool: string }) {
  const map: Record<string, string> = {
    "generate-script": "Script",
    "generate-brief": "Brief",
    "generate-shot-plan": "Shot Plan",
    "generate-voiceover": "Voiceover",
    "generate-video-fal": "Video",
    "generate-cinematic": "Cinematic",
    "generate-cinematic-sequence": "Sequence",
    "generate-avatar": "Avatar",
    "generate-subtitles": "Subtitles",
  };
  return <>{map[tool] ?? tool}</>;
}

const CARD: React.CSSProperties = {
  background: "rgba(75,30,130,0.75)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(207,164,47,0.2)",
  borderRadius: "16px",
  padding: "20px",
};

const STAT_CARD: React.CSSProperties = {
  background: "rgba(45,10,62,0.6)",
  border: "1px solid rgba(207,164,47,0.15)",
  borderRadius: "12px",
  padding: "16px 20px",
  flex: 1,
};

export default function AnalyticsWidget() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d && !d.error) setData(d as AnalyticsData); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ ...CARD, minHeight: "120px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "rgba(224,208,255,0.4)", fontSize: "13px" }}>Loading analytics…</span>
      </div>
    );
  }

  if (!data) return null;

  const hasActivity = data.recent_events.length > 0 || data.credits_used_this_month > 0;

  return (
    <div style={CARD}>
      <div style={{
        fontSize: "13px", fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "rgba(207,164,47,0.9)", marginBottom: "16px",
      }}>
        Your Studio This Month
      </div>

      {/* Stat cards */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
        <div style={STAT_CARD}>
          <div style={{ fontSize: "11px", color: "rgba(224,208,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
            Credits Used
          </div>
          <div style={{
            fontSize: "28px", fontWeight: 700,
            background: "linear-gradient(105deg,#CFA42F,#F7D96B)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            {data.credits_used_this_month}
          </div>
          <div style={{ fontSize: "11px", color: "rgba(224,208,255,0.4)", marginTop: "2px" }}>this month</div>
        </div>

        {data.credits_remaining !== null && (
          <div style={STAT_CARD}>
            <div style={{ fontSize: "11px", color: "rgba(224,208,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
              Credits Left
            </div>
            <div style={{
              fontSize: "28px", fontWeight: 700,
              color: data.credits_remaining === 0
                ? "#f87171"
                : data.credits_remaining < 20 ? "#F59E0B" : "#4ECB8C",
            }}>
              {data.credits_remaining}
            </div>
            <div style={{ fontSize: "11px", color: "rgba(224,208,255,0.4)", marginTop: "2px" }}>remaining</div>
          </div>
        )}

        {data.top_tools.length > 0 && (
          <div style={{ ...STAT_CARD, flex: "1 1 200px" }}>
            <div style={{ fontSize: "11px", color: "rgba(224,208,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>
              Top Tools
            </div>
            {data.top_tools.map((t, i) => (
              <div key={t.tool} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: i < data.top_tools.length - 1 ? "6px" : 0 }}>
                <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.8)" }}>
                  <ToolLabel tool={t.tool} />
                </span>
                <span style={{
                  fontSize: "12px", fontWeight: 700, color: "#CFA42F",
                  background: "rgba(207,164,47,0.1)", padding: "2px 8px", borderRadius: "9999px",
                  border: "1px solid rgba(207,164,47,0.2)",
                }}>
                  {t.count}×
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent activity */}
      {hasActivity && data.recent_events.length > 0 && (
        <div>
          <div style={{ fontSize: "11px", color: "rgba(224,208,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>
            Recent Generations
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {data.recent_events.map((e) => (
              <div key={e.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", borderRadius: "8px",
                background: "rgba(45,10,62,0.4)", border: "1px solid rgba(207,164,47,0.1)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{
                    width: "6px", height: "6px", borderRadius: "50%",
                    background: "rgba(207,164,47,0.7)", flexShrink: 0,
                    boxShadow: "0 0 6px rgba(207,164,47,0.4)",
                  }} />
                  <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.8)" }}>
                    <ToolLabel tool={e.event_type} />
                  </span>
                  {(e.metadata as { action?: string } | null)?.action && (
                    <span style={{ fontSize: "11px", color: "rgba(224,208,255,0.4)" }}>
                      {(e.metadata as { action?: string }).action}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  {e.credits_used > 0 && (
                    <span style={{ fontSize: "11px", color: "rgba(207,164,47,0.7)", fontWeight: 600 }}>
                      -{e.credits_used}cr
                    </span>
                  )}
                  <span style={{ fontSize: "11px", color: "rgba(224,208,255,0.35)" }}>
                    {formatTime(e.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasActivity && (
        <p style={{ fontSize: "13px", color: "rgba(224,208,255,0.35)", textAlign: "center", padding: "8px 0" }}>
          Start creating to see your activity here.
        </p>
      )}
    </div>
  );
}
