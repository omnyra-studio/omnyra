"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

const C = { bg: "#070710", text: "#f5f3ff", sub: "rgba(245,243,255,0.55)", violet: "#8b5cf6" };

export default function LipSyncPage() {
  const router = useRouter();
  const [videoUrl, setVideoUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [credits, setCredits] = useState(null);

  async function generate() {
    if (!videoUrl.trim() || !audioUrl.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/lipsync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({ videoUrl, audioUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lip sync failed");
      if (data.balance !== undefined) setCredits(data.balance);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const inp = {
    width: "100%", padding: "12px 16px", borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)",
    color: C.text, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  };

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
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Lip Sync Studio</h1>
            <p style={{ margin: 0, fontSize: 12, color: C.sub }}>Sync any face to audio with SyncLabs</p>
          </div>
          {credits !== null && (
            <div style={{ marginLeft: "auto", fontSize: 12, color: C.sub, background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "4px 10px" }}>
              ⚡ {credits} credits
            </div>
          )}
        </div>

        <div style={{ padding: "16px 20px", borderRadius: 14, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", marginBottom: 24, fontSize: 13, color: C.sub, lineHeight: 1.6 }}>
          <strong style={{ color: C.text }}>How it works:</strong> Provide a video URL (with a face) and an audio URL. SyncLabs will sync the lips to the audio. Works best with clear, front-facing footage.
        </div>

        {/* Video URL */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: C.sub, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>Video URL (MP4 with face)</div>
          <input
            value={videoUrl}
            onChange={e => setVideoUrl(e.target.value)}
            placeholder="https://example.com/face-video.mp4"
            style={inp}
          />
        </div>

        {/* Audio URL */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: C.sub, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>Audio URL (MP3 or WAV)</div>
          <input
            value={audioUrl}
            onChange={e => setAudioUrl(e.target.value)}
            placeholder="https://example.com/speech.mp3"
            style={inp}
          />
          <div style={{ fontSize: 11, color: C.sub, marginTop: 6 }}>
            Tip: Generate audio first in AI Voice, then paste the URL here.
          </div>
        </div>

        {error && (
          <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, color: "#f87171", fontSize: 13 }}>
            {error}
          </div>
        )}

        <button onClick={generate} disabled={loading || !videoUrl.trim() || !audioUrl.trim()}
          style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", cursor: loading || !videoUrl.trim() || !audioUrl.trim() ? "not-allowed" : "pointer", fontFamily: "inherit",
            background: loading || !videoUrl.trim() || !audioUrl.trim() ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#8b5cf6,#6d28d9)",
            color: loading || !videoUrl.trim() || !audioUrl.trim() ? C.sub : "#fff", fontWeight: 700, fontSize: 15 }}>
          {loading ? "Syncing lips..." : "Sync Lips ✦"}
        </button>

        {result && (
          <div style={{ marginTop: 24, padding: "20px", borderRadius: 16, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>Job Submitted</div>
            <div style={{ fontSize: 14, color: C.text, marginBottom: 8 }}>Status: <span style={{ color: "#a78bfa" }}>{result.status}</span></div>
            {result.jobId && (
              <div style={{ fontSize: 12, color: C.sub, fontFamily: "monospace", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 12px" }}>
                Job ID: {result.jobId}
              </div>
            )}
            <div style={{ marginTop: 12, fontSize: 12, color: C.sub }}>
              SyncLabs processes lip sync in the background. Check back shortly for your result.
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
