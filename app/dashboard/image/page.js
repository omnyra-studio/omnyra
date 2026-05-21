"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

const STYLES = [
  { id: "realistic",  label: "Realistic",  emoji: "🌍" },
  { id: "cinematic",  label: "Cinematic",  emoji: "🎬" },
  { id: "anime",      label: "Anime",      emoji: "✨" },
  { id: "cartoon",    label: "Cartoon",    emoji: "🎨" },
  { id: "futuristic", label: "Futuristic", emoji: "🔮" },
  { id: "meme",       label: "Meme",       emoji: "😂" },
];

const C = { bg: "#070710", text: "#f5f3ff", sub: "rgba(245,243,255,0.55)", violet: "#8b5cf6" };

export default function ImagePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("realistic");
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const [error, setError] = useState("");
  const [credits, setCredits] = useState(null);

  async function generate() {
    if (!prompt.trim()) return;
    setLoading(true); setError(""); setImageUrl(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({ prompt, style }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Image generation failed");
      setImageUrl(data.url);
      if (data.balance !== undefined) setCredits(data.balance);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>AI Image</h1>
            <p style={{ margin: 0, fontSize: 12, color: C.sub }}>Generate images with Flux AI</p>
          </div>
          {credits !== null && (
            <div style={{ marginLeft: "auto", fontSize: 12, color: C.sub, background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "4px 10px" }}>
              ⚡ {credits} credits
            </div>
          )}
        </div>

        {/* Style selector */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: C.sub, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>Style</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {STYLES.map(s => (
              <button key={s.id} onClick={() => setStyle(s.id)}
                style={{ padding: "10px 8px", borderRadius: 12, textAlign: "center", cursor: "pointer", fontFamily: "inherit",
                  background: style === s.id ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.04)",
                  border: style === s.id ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.08)",
                  color: style === s.id ? "#fff" : C.sub, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 18 }}>{s.emoji}</span>
                <span style={{ fontSize: 11, fontWeight: style === s.id ? 600 : 400 }}>{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Prompt input */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: C.sub, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>Prompt</div>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe your image... e.g. 'A futuristic city at sunset with flying cars and neon lights'"
            rows={4}
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
            background: loading || !prompt.trim() ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#8b5cf6,#6d28d9)",
            color: loading || !prompt.trim() ? C.sub : "#fff", fontWeight: 700, fontSize: 15 }}>
          {loading ? "Generating image..." : "Generate Image ✦"}
        </button>

        {imageUrl && (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>Generated Image</div>
            <img src={imageUrl} alt="Generated" style={{ width: "100%", borderRadius: 16, border: "1px solid rgba(255,255,255,0.1)" }} />
            <a href={imageUrl} target="_blank" rel="noreferrer" download
              style={{ display: "block", marginTop: 12, textAlign: "center", padding: "12px", borderRadius: 12,
                background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: C.text, textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
              Download Image ↓
            </a>
            <button onClick={generate}
              style={{ width: "100%", marginTop: 8, padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.04)", color: C.sub, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
              Regenerate ↻
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
