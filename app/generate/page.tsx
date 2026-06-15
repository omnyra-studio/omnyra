"use client";

import { useState } from "react";
import AnimatedBackground from "@/components/AnimatedBackground";
import GenerationProgress from "@/components/GenerationProgress";
import Link from "next/link";

const DEMO_STAGES = [
  { name: "Analyze",  duration: 900  },
  { name: "Script",   duration: 1600 },
  { name: "Generate", duration: 4800 },
  { name: "Voice",    duration: 1100 },
  { name: "Stitch",   duration: 900  },
] as const;

export default function GeneratePage() {
  const [prompt,            setPrompt]            = useState("");
  const [isGenerating,      setIsGenerating]      = useState(false);
  const [stage,             setStage]             = useState("");
  const [progress,          setProgress]          = useState(0);
  const [estimatedTimeLeft, setEstimatedTimeLeft] = useState(0);
  const [error,             setError]             = useState<string | null>(null);
  const [videoUrl,          setVideoUrl]          = useState<string | null>(null);

  async function startGeneration() {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setError(null);
    setProgress(0);
    setVideoUrl(null);

    let current = 0;
    const totalStages = DEMO_STAGES.length;

    for (let si = 0; si < totalStages; si++) {
      const s = DEMO_STAGES[si];
      setStage(s.name);
      const steps = 12;
      for (let i = 0; i < steps; i++) {
        current = Math.min(99, current + (100 / totalStages) / steps);
        setProgress(Math.round(current));
        setEstimatedTimeLeft(Math.ceil((100 - current) * 0.85));
        await new Promise(r => setTimeout(r, s.duration / steps));
      }
    }

    setProgress(100);
    setStage("stitch");
    await new Promise(r => setTimeout(r, 700));
    setVideoUrl("https://example.com/omnyra-demo.mp4");
    setIsGenerating(false);
  }

  function cancelGeneration() {
    setIsGenerating(false);
    setProgress(0);
    setStage("");
    setError("Generation was cancelled.");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0F0A1F", color: "#E8DEFF", position: "relative" }}>
      <AnimatedBackground />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 680, margin: "0 auto", padding: "clamp(1.5rem,5vw,4rem) 1.5rem 6rem" }}>

        {/* Back link */}
        <Link href="/dashboard" style={{ fontSize: 13, color: "#9CA3AF", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 32 }}>
          ← Dashboard
        </Link>

        {/* Heading */}
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ fontSize: "clamp(2rem,5vw,3rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: 0, lineHeight: 1.1 }}>
            Generate Video
          </h1>
          <p style={{ fontSize: 17, color: "#9CA3AF", marginTop: 10, marginBottom: 0 }}>
            Describe what you want. Omnyra handles the rest.
          </p>
        </div>

        {/* Prompt card */}
        <div style={{
          background: "#1A1428",
          border: "1px solid rgba(124,58,237,0.4)",
          borderRadius: 24,
          padding: "clamp(1.5rem,4vw,2.5rem)",
          marginBottom: 32,
        }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: 12 }}>
            Describe your video
          </label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="A barista in an Adelaide café handing fresh coffee to a customer on a busy morning…"
            rows={5}
            style={{
              width: "100%",
              background: "rgba(0,0,0,0.5)",
              border: "1px solid rgba(124,58,237,0.35)",
              borderRadius: 14,
              padding: "1rem 1.25rem",
              fontSize: 15,
              color: "#E8DEFF",
              fontFamily: "inherit",
              outline: "none",
              resize: "vertical",
              boxSizing: "border-box",
              lineHeight: 1.6,
            }}
          />

          <button
            onClick={startGeneration}
            disabled={isGenerating || !prompt.trim()}
            className={!isGenerating && prompt.trim() ? "gold-btn" : undefined}
            style={{
              marginTop: 16,
              width: "100%",
              padding: "16px",
              borderRadius: 14,
              fontSize: 16,
              fontWeight: 700,
              fontFamily: "inherit",
              border: "none",
              cursor: isGenerating || !prompt.trim() ? "not-allowed" : "pointer",
              opacity: !prompt.trim() ? 0.5 : 1,
              background: isGenerating ? "rgba(124,58,237,0.3)" : undefined,
              color: isGenerating ? "#9CA3AF" : undefined,
              transition: "opacity 0.2s",
            }}
          >
            {isGenerating ? "Generating…" : "Generate Video →"}
          </button>
        </div>

        {/* Error dismissal */}
        {error && !isGenerating && (
          <div style={{
            background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
            borderRadius: 14, padding: "14px 18px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 24,
          }}>
            <span style={{ fontSize: 14, color: "#F87171" }}>⚠ {error}</span>
            <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
        )}

        {/* Success */}
        {videoUrl && !isGenerating && (
          <div style={{
            background: "rgba(78,203,140,0.08)", border: "1px solid rgba(78,203,140,0.3)",
            borderRadius: 20, padding: "2rem", textAlign: "center",
          }}>
            <p style={{ color: "#4ECB8C", fontSize: 16, fontWeight: 600, marginBottom: 16 }}>✅ Video Generated Successfully</p>
            <video controls src={videoUrl} style={{ width: "100%", borderRadius: 14, background: "#000" }} />
          </div>
        )}
      </div>

      {/* Full-screen overlay — rendered at page root so it covers everything */}
      <GenerationProgress
        isGenerating={isGenerating}
        currentStage={stage}
        progress={progress}
        estimatedTimeLeft={estimatedTimeLeft}
        error={error ?? undefined}
        onCancel={cancelGeneration}
      />
    </div>
  );
}
