"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

const VOICES = [
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", desc: "Warm narrative male" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", desc: "Soft female, story" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", desc: "Well-rounded male" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", desc: "Emotional female" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", desc: "Deep male narrator" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", desc: "Crisp male" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", desc: "Clear narration" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", desc: "Confident male" },
];

const C = { bg: "#070710", text: "#f5f3ff", sub: "rgba(245,243,255,0.55)", violet: "#8b5cf6" };

export default function VoicePage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState(VOICES[0].id);
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [error, setError] = useState("");
  const [credits, setCredits] = useState(null);

  async function generate() {
    if (!text.trim()) return;
    setLoading(true); setError(""); setAudioUrl(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({ text, voiceId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Voice generation failed");
      }
      const remaining = res.headers.get("X-Credits-Remaining");
      if (remaining) setCredits(remaining);
      const blob = await res.blob();
      setAudioUrl(URL.createObjectURL(blob));
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
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>AI Voice</h1>
            <p style={{ margin: 0, fontSize: 12, color: C.sub }}>Text-to-speech with ElevenLabs</p>
          </div>
          {credits !== null && (
            <div style={{ marginLeft: "auto", fontSize: 12, color: C.sub, background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "4px 10px" }}>
              ⚡ {credits} credits
            </div>
          )}
        </div>

        {/* Voice selector */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: C.sub, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>Select Voice</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {VOICES.map(v => (
              <button key={v.id} onClick={() => setVoiceId(v.id)}
                style={{ padding: "10px 14px", borderRadius: 12, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                  background: voiceId === v.id ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.04)",
                  border: voiceId === v.id ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.08)",
                  color: voiceId === v.id ? "#fff" : C.sub }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{v.name}</div>
                <div style={{ fontSize: 11, marginTop: 2 }}>{v.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Text input */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: C.sub, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>Your Script</div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Enter your script here... Up to 500 characters for 1 credit, more for 2 credits."
            rows={6}
            style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.04)", color: C.text, fontSize: 14, fontFamily: "inherit",
              resize: "vertical", outline: "none", boxSizing: "border-box" }}
          />
          <div style={{ fontSize: 11, color: C.sub, marginTop: 4, textAlign: "right" }}>{text.length} chars · {text.length > 500 ? "2 credits" : "1 credit"}</div>
        </div>

        {error && (
          <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, color: "#f87171", fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Generate button */}
        <button onClick={generate} disabled={loading || !text.trim()}
          style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", cursor: loading || !text.trim() ? "not-allowed" : "pointer", fontFamily: "inherit",
            background: loading || !text.trim() ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#8b5cf6,#6d28d9)",
            color: loading || !text.trim() ? C.sub : "#fff", fontWeight: 700, fontSize: 15 }}>
          {loading ? "Generating voice..." : "Generate Voice ✦"}
        </button>

        {/* Audio output */}
        {audioUrl && (
          <div style={{ marginTop: 24, padding: "20px", borderRadius: 16, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)" }}>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>Generated Audio</div>
            <audio controls src={audioUrl} style={{ width: "100%", borderRadius: 8 }} />
            <a href={audioUrl} download="omnyra-voice.mp3"
              style={{ display: "block", marginTop: 12, textAlign: "center", padding: "10px", borderRadius: 10,
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: C.text, textDecoration: "none", fontSize: 13 }}>
              Download MP3 ↓
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
