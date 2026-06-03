"use client";
import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import AnimatedBackground from "@/components/AnimatedBackground";

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
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "transparent", position: "relative", color: C.text, fontFamily: '"Instrument Sans","Inter",-apple-system,sans-serif', padding: "0 0 80px" }}>
      <AnimatedBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ borderBottom: "1px solid rgba(207,164,47,0.15)", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, background: "rgba(45,10,62,0.75)", backdropFilter: "blur(16px)", zIndex: 40 }}>
          <span style={{ fontWeight: 700, fontSize: 18, background: "linear-gradient(90deg,#CFA42F,#E8B84B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Omnyra</span>
          <button onClick={() => router.push("/dashboard")} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "6px 10px", color: C.text, cursor: "pointer", fontSize: 16 }}>←</button>
          <span style={{ fontWeight: 700, fontSize: 16 }}>AI Image</span>
        </div>
        <div style={{ maxWidth: 440, margin: "0 auto", padding: "16px 20px 0" }}>

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
            <Image src={imageUrl} alt="Generated"
              width={0} height={0} sizes="100vw" unoptimized
              style={{ width: "100%", height: "auto", borderRadius: 16, border: "1px solid rgba(255,255,255,0.1)" }} />
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
      </div>
    </main>
  );
}
