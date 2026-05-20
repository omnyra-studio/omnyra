"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

export default function ScriptStudio() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("TikTok");
  const [duration, setDuration] = useState("60 seconds");
  const [tone, setTone] = useState("Engaging");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    if (!topic.trim()) return;
    setLoading(true);
    setResult("");
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({
          prompt: `Write a ${duration} ${platform} video script about: ${topic}. Tone: ${tone}. Include hook, main content, and CTA. Format with clear sections.`,
        }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setResult(data.result || data.content || data.text || "");
    } catch {
      setError("Generation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const sel = (opts, val, set) => (
    <select
      value={val}
      onChange={e => set(e.target.value)}
      style={{
        padding: "10px 14px", borderRadius: 8,
        border: "0.5px solid #2a2a2a", background: "#1a1a1a",
        color: "#fff", fontSize: 14, width: "100%",
      }}
    >
      {opts.map(o => <option key={o}>{o}</option>)}
    </select>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", padding: "2rem" }}>
      <button
        onClick={() => router.push("/dashboard")}
        style={{ background: "transparent", border: "none", color: "#666", cursor: "pointer", fontSize: 14, marginBottom: 24 }}
      >
        ← Back to Dashboard
      </button>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>✍️ Script Studio</h1>
      <p style={{ color: "#666", marginBottom: 32 }}>Generate AI-powered scripts for any platform</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, maxWidth: 1000, margin: "0 auto" }}>

        {/* INPUT PANEL */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
              Topic / Idea
            </label>
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="What is your video about?"
              rows={4}
              style={{
                padding: "12px 16px", borderRadius: 10,
                border: "0.5px solid #2a2a2a", background: "#1a1a1a",
                color: "#fff", fontSize: 14, width: "100%",
                resize: "vertical", fontFamily: "inherit", boxSizing: "border-box",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
              Platform
            </label>
            {sel(["TikTok", "Instagram Reels", "YouTube Shorts", "YouTube", "LinkedIn", "Twitter/X"], platform, setPlatform)}
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
              Duration
            </label>
            {sel(["30 seconds", "60 seconds", "90 seconds", "3 minutes", "5 minutes", "10 minutes"], duration, setDuration)}
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
              Tone
            </label>
            {sel(["Engaging", "Professional", "Funny", "Educational", "Inspirational", "Casual"], tone, setTone)}
          </div>
          <button
            onClick={generate}
            disabled={loading || !topic.trim()}
            style={{
              padding: "14px", borderRadius: 10,
              background: loading || !topic.trim() ? "#222" : "#7c6fff",
              color: loading || !topic.trim() ? "#555" : "#fff",
              fontWeight: 700, fontSize: 15, border: "none",
              cursor: loading || !topic.trim() ? "not-allowed" : "pointer",
              transition: "background 0.2s",
            }}
          >
            {loading ? "Generating..." : "Generate Script →"}
          </button>
          {error && (
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", fontSize: 13 }}>
              {error}
            </div>
          )}
        </div>

        {/* OUTPUT PANEL */}
        <div style={{
          background: "#111", borderRadius: 16, border: "0.5px solid #1e1e1e",
          padding: "1.5rem", minHeight: 400, position: "relative",
          display: "flex", flexDirection: "column",
        }}>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "#555", fontSize: 14 }}>
              Writing your script...
            </div>
          )}
          {!loading && !result && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "#333", fontSize: 14, textAlign: "center" }}>
              Your script will appear here.<br />Fill in the fields and hit Generate.
            </div>
          )}
          {result && (
            <>
              <button
                onClick={copy}
                style={{
                  position: "absolute", top: 16, right: 16,
                  padding: "6px 14px", borderRadius: 8,
                  border: "0.5px solid #333", background: "transparent",
                  color: copied ? "#7c6fff" : "#888", fontSize: 12, cursor: "pointer",
                }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
              <pre style={{
                whiteSpace: "pre-wrap", fontFamily: "inherit",
                fontSize: 14, lineHeight: 1.7, color: "#e5e5e5", marginTop: 8, overflowY: "auto",
              }}>
                {result}
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
