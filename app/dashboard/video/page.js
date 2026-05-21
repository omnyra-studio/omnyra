"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

const C = { bg: "#070710", text: "#f5f3ff", sub: "rgba(245,243,255,0.55)", violet: "#8b5cf6" };

const DURATIONS = [
  { val: 5,  label: "5 sec",  desc: "Quick clip" },
  { val: 10, label: "10 sec", desc: "Social short" },
  { val: 30, label: "30 sec", desc: "Story format" },
  { val: 60, label: "1 min",  desc: "Creator tier" },
];

export default function VideoPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [credits, setCredits] = useState(null);
  const [polling, setPolling] = useState(false);

  async function generate() {
    if (!prompt.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/video", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({ prompt, duration }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Video generation failed");
      if (data.balance !== undefined) setCredits(data.balance);

      if (data.status === "complete" && data.url) {
        setResult(data);
      } else {
        setResult(data);
        if (data.jobId) pollStatus(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function pollStatus(jobData) {
    setPolling(true);
    const { data: { session } } = await supabase.auth.getSession();
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 30) { clearInterval(interval); setPolling(false); return; }
      try {
        const res = await fetch(`/api/status?provider=${jobData.provider}&jobId=${jobData.jobId}&subtype=${jobData.subtype || ""}`, {
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        const data = await res.json();
        if (data.url || data.status === "complete") {
          setResult(prev => ({ ...prev, url: data.url, status: "complete" }));
          clearInterval(interval);
          setPolling(false);
        }
      } catch {}
    }, 5000);
  }

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: '"Instrument Sans","Inter",-apple-system,sans-serif', padding: "0 0 80px" }}>
      <div style={{ maxWidth: 440, margin: "0 auto", padding: "0 20px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 0 24px" }}>
          <button onClick={() => router.push("/dashboard")}
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "8px 12px", color: C.text, cursor: "pointer", fontSize: 18 }}>
            ←
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>AI Video</h1>
            <p style={{ margin: 0, fontSize: 12, color: C.sub }}>Text or image to video with Pika / Kling</p>
          </div>
          {credits !== null && (
            <div style={{ marginLeft: "auto", fontSize: 12, color: C.sub, background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "4px 10px" }}>
              ⚡ {credits} credits
            </div>
          )}
        </div>

        {/* Duration */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: C.sub, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>Duration</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {DURATIONS.map(d => (
              <button key={d.val} onClick={() => setDuration(d.val)}
                style={{ padding: "10px 6px", borderRadius: 12, textAlign: "center", cursor: "pointer", fontFamily: "inherit",
                  background: duration === d.val ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.04)",
                  border: duration === d.val ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.08)",
                  color: duration === d.val ? "#fff" : C.sub, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{d.label}</span>
                <span style={{ fontSize: 10 }}>{d.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Prompt */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: C.sub, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>Video Prompt</div>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe your video... e.g. 'A dramatic drone shot of a city at golden hour, cinematic movement, 4K quality'"
            rows={5}
            style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.04)", color: C.text, fontSize: 14, fontFamily: "inherit",
              resize: "vertical", outline: "none", boxSizing: "border-box" }}
          />
        </div>

        {error && (
          <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, color: "#f87171", fontSize: 13 }}>
            {error}
          </div>
        )}

        <button onClick={generate} disabled={loading || !prompt.trim()}
          style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", cursor: loading || !prompt.trim() ? "not-allowed" : "pointer", fontFamily: "inherit",
            background: loading || !prompt.trim() ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#8b5cf6,#22d3ee)",
            color: loading || !prompt.trim() ? C.sub : "#fff", fontWeight: 700, fontSize: 15 }}>
          {loading ? "Generating video..." : "Generate Video ✦"}
        </button>

        {result && (
          <div style={{ marginTop: 24, padding: "20px", borderRadius: 16, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}>
            {result.url ? (
              <>
                <div style={{ fontSize: 12, color: C.sub, marginBottom: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>Generated Video</div>
                <video controls src={result.url} style={{ width: "100%", borderRadius: 12 }} />
                <a href={result.url} target="_blank" rel="noreferrer" download
                  style={{ display: "block", marginTop: 12, textAlign: "center", padding: "12px", borderRadius: 12,
                    background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: C.text, textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
                  Download Video ↓
                </a>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Processing your video</div>
                <div style={{ fontSize: 13, color: C.sub }}>
                  {polling ? "Checking status..." : `Job ID: ${result.jobId || "Submitted"} · Provider: ${result.provider}`}
                </div>
                {result.jobId && (
                  <div style={{ marginTop: 12, fontSize: 12, color: C.sub, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px", fontFamily: "monospace" }}>
                    {result.provider} · {result.jobId}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
