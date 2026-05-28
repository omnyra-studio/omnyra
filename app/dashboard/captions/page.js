"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import AnimatedBackground from "@/components/AnimatedBackground";

const C = { bg: "#070710", text: "#f5f3ff", sub: "rgba(245,243,255,0.55)", violet: "#8b5cf6" };

const MODES = [
  { id: "viral",      label: "Viral",       emoji: "🔥" },
  { id: "creator",   label: "Creator",      emoji: "🎨" },
  { id: "edu",       label: "Educational",  emoji: "🧒" },
  { id: "truth",     label: "Truth",        emoji: "⚖️" },
];

export default function CaptionsPage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState("viral");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(null);

  async function generate() {
    if (!topic.trim()) return;
    setLoading(true); setError(""); setResults(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({ tool: "caption", prompt: topic, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Caption generation failed");
      const options = data.parsed?.options || [];
      if (options.length > 0) {
        setResults(options);
      } else {
        setError("No captions returned. Try again.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function copyCaption(idx, text) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(idx);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function copyAll(item) {
    const text = `${item.caption}\n\n${item.hashtags.join(" ")}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(`all-${item.caption.slice(0, 10)}`);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <main style={{ minHeight: "100vh", background: "transparent", position: "relative", color: C.text, fontFamily: '"Instrument Sans","Inter",-apple-system,sans-serif', padding: "0 0 80px" }}>
      <AnimatedBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ borderBottom: "1px solid rgba(207,164,47,0.15)", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, background: "rgba(45,10,62,0.75)", backdropFilter: "blur(16px)", zIndex: 40 }}>
          <span style={{ fontWeight: 700, fontSize: 18, background: "linear-gradient(90deg,#CFA42F,#E8B84B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Omnyra</span>
          <button onClick={() => router.push("/dashboard")} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "6px 10px", color: C.text, cursor: "pointer", fontSize: 16 }}>←</button>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Captions &amp; Tags</span>
        </div>
        <div style={{ maxWidth: 440, margin: "0 auto", padding: "16px 20px 0" }}>

        {/* Mode selector */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: C.sub, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>Mode</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {MODES.map(m => (
              <button key={m.id} onClick={() => setMode(m.id)}
                style={{ padding: "10px 6px", borderRadius: 12, textAlign: "center", cursor: "pointer", fontFamily: "inherit",
                  background: mode === m.id ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.04)",
                  border: mode === m.id ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.08)",
                  color: mode === m.id ? "#fff" : C.sub, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 16 }}>{m.emoji}</span>
                <span style={{ fontSize: 10, fontWeight: mode === m.id ? 600 : 400 }}>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Topic input */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: C.sub, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>Topic or Description</div>
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="Describe your video or content... e.g. 'Morning routine that changed my life'"
            rows={3}
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

        <button onClick={generate} disabled={loading || !topic.trim()}
          style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", cursor: loading || !topic.trim() ? "not-allowed" : "pointer", fontFamily: "inherit",
            background: loading || !topic.trim() ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#8b5cf6,#22d3ee)",
            color: loading || !topic.trim() ? C.sub : "#fff", fontWeight: 700, fontSize: 15 }}>
          {loading ? "Generating captions..." : "Generate 5 Captions ✦"}
        </button>

        {results && (
          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 11, color: C.sub, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
              {results.length} Captions Generated
            </div>
            {results.map((item, idx) => (
              <div key={idx} style={{ padding: "16px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize: 11, color: "#a78bfa", fontWeight: 600, marginBottom: 6 }}>Caption {idx + 1}</div>
                <p style={{ margin: "0 0 10px", fontSize: 14, lineHeight: 1.5, color: C.text }}>{item.caption}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                  {item.hashtags?.map((tag, ti) => (
                    <span key={ti} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 8, background: "rgba(139,92,246,0.15)", color: "#a78bfa" }}>
                      {tag}
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => copyCaption(idx, item.caption)}
                    style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: C.sub, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>
                    {copied === idx ? "✓ Copied!" : "Copy Caption"}
                  </button>
                  <button onClick={() => copyAll(item)}
                    style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.1)", color: "#a78bfa", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600 }}>
                    {copied === `all-${item.caption.slice(0, 10)}` ? "✓ Copied!" : "Copy All"}
                  </button>
                </div>
              </div>
            ))}
            <button onClick={generate} style={{ padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: C.sub, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
              Regenerate ↻
            </button>
          </div>
        )}
        </div>
      </div>
    </main>
  );
}
