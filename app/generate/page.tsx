"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AnimatedBackground from "@/components/AnimatedBackground";
import GenerationProgress from "@/components/GenerationProgress";
import Link from "next/link";

interface ScriptOption {
  id:           string;
  title:        string;
  hook:         string;
  narration:    string;
  scenePrompts: [string, string, string];
}

type PageStep = "idea" | "scripts" | "generating" | "done";

const STAGES = [
  { name: "Analyze",  weight: 0.08 },
  { name: "Script",   weight: 0.12 },
  { name: "Generate", weight: 0.55 },
  { name: "Voice",    weight: 0.15 },
  { name: "Stitch",   weight: 0.10 },
] as const;

function GeneratePageInner() {
  const searchParams = useSearchParams();
  const router       = useRouter();

  const [step,              setStep]             = useState<PageStep>("idea");
  const [idea,              setIdea]             = useState("");
  const [targetDuration,    setTargetDuration]   = useState<30 | 60>(30);
  const [scripts,           setScripts]          = useState<ScriptOption[]>([]);
  const [selectedScript,    setSelectedScript]   = useState<ScriptOption | null>(null);
  const [loadingScripts,    setLoadingScripts]   = useState(false);
  const [scriptError,       setScriptError]      = useState<string | null>(null);
  const [stage,             setStage]            = useState("");
  const [progress,          setProgress]         = useState(0);
  const [estimatedTimeLeft, setEstimatedTimeLeft]= useState(0);
  const [genError,          setGenError]         = useState<string | null>(null);
  const [videoUrl,          setVideoUrl]         = useState<string | null>(null);
  const [continueCtx,       setContinueCtx]      = useState<{ script: string; seriesId: string; parentId: string } | null>(null);
  const [loadingContinue,   setLoadingContinue]  = useState(false);

  const continueFrom = searchParams.get("continueFrom");

  useEffect(() => {
    if (!continueFrom) return;
    setLoadingContinue(true);
    fetch("/api/continue-story", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setScriptError(data.error); return; }
        setIdea(data.script ?? "");
        setContinueCtx({ script: data.script, seriesId: data.seriesId, parentId: data.parentRenderId });
      })
      .catch(() => setScriptError("Could not load continuation context."))
      .finally(() => setLoadingContinue(false));
  }, [continueFrom]);

  // ── Step 1: Generate script options ─────────────────────────────────────────
  async function generateScripts() {
    if (!idea.trim() || loadingScripts) return;
    setLoadingScripts(true);
    setScriptError(null);
    setScripts([]);
    try {
      const res = await fetch("/api/generate-scripts", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ idea: idea.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setScripts(data.scripts ?? []);
      setStep("scripts");
    } catch (e) {
      setScriptError((e as Error).message ?? "Failed to generate scripts. Try again.");
    } finally {
      setLoadingScripts(false);
    }
  }

  // ── Step 2: Generate video from selected script ──────────────────────────────
  const simulateProgress = useCallback(async (abort: AbortController) => {
    let pct = 0;
    const totalMs = targetDuration === 60 ? 280_000 : 160_000;
    for (const s of STAGES) {
      if (abort.signal.aborted) return;
      setStage(s.name);
      const steps  = 15;
      const stageMs = totalMs * s.weight;
      for (let i = 0; i < steps; i++) {
        if (abort.signal.aborted) return;
        pct = Math.min(99, pct + (s.weight * 100) / steps);
        setProgress(Math.round(pct));
        setEstimatedTimeLeft(Math.ceil(((100 - pct) / 100) * (totalMs / 1000)));
        await new Promise(r => setTimeout(r, stageMs / steps));
      }
    }
  }, [targetDuration]);

  async function startGeneration(script: ScriptOption) {
    setSelectedScript(script);
    setStep("generating");
    setGenError(null);
    setProgress(0);
    setVideoUrl(null);

    const abort = new AbortController();
    simulateProgress(abort);

    try {
      const body: Record<string, unknown> = {
        scenePrompts:  script.scenePrompts,
        voiceoverText: script.narration,
        targetDuration,
      };
      if (continueCtx) {
        body.seriesId       = continueCtx.seriesId;
        body.parentRenderId = continueCtx.parentId;
      }

      const res = await fetch("/api/generate-cinematic-sequence", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
        signal:  abort.signal,
      });

      abort.abort();
      setProgress(100);
      setStage("Stitch");

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      const url = data.videoUrl ?? data.video_url ?? data.finalVideoUrl ?? null;
      if (!url) throw new Error("No video URL returned from server.");

      setVideoUrl(url);
      setStep("done");
    } catch (e) {
      abort.abort();
      if ((e as Error).name === "AbortError") return;
      setGenError((e as Error).message ?? "Generation failed. Please try again.");
      setStep("scripts"); // go back to picker so user can retry
    }
  }

  function cancelGeneration() {
    setStep("scripts");
    setProgress(0);
    setStage("");
    setGenError("Generation was cancelled.");
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#0F0A1F", color: "#E8DEFF", position: "relative" }}>
      <AnimatedBackground />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 680, margin: "0 auto", padding: "clamp(1.5rem,5vw,4rem) 1.5rem 6rem" }}>

        <Link href="/dashboard" style={{ fontSize: 13, color: "#9CA3AF", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 32 }}>
          ← Dashboard
        </Link>

        {/* ── IDEA STEP ─────────────────────────────────────────────────────── */}
        {(step === "idea" || step === "scripts") && (
          <>
            <div style={{ marginBottom: 32 }}>
              <h1 style={{ fontSize: "clamp(1.8rem,5vw,2.8rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: 0, lineHeight: 1.1 }}>
                {continueCtx ? "Continue Story" : "Generate Video"}
              </h1>
              <p style={{ fontSize: 15, color: "#9CA3AF", marginTop: 8, marginBottom: 0 }}>
                {step === "idea"
                  ? "Describe your idea. We'll write 5 scripts — you pick one."
                  : "Pick a script to generate your video."}
              </p>
            </div>

            {continueCtx && (
              <div style={{ background: "rgba(78,203,140,0.08)", border: "1px solid rgba(78,203,140,0.25)", borderRadius: 14, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span style={{ color: "#4ECB8C", fontSize: 13, fontWeight: 600 }}>↪ Continuing from previous episode</span>
                <button onClick={() => { setContinueCtx(null); setIdea(""); }} style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: 16 }}>×</button>
              </div>
            )}

            {/* Idea input */}
            <div style={{ background: "#1A1428", border: "1px solid rgba(124,58,237,0.4)", borderRadius: 24, padding: "clamp(1.2rem,4vw,2rem)", marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: 10 }}>
                Your idea
              </label>
              <textarea
                value={idea}
                onChange={e => { setIdea(e.target.value); if (step === "scripts") setStep("idea"); }}
                placeholder="A young woman in Sydney stops to help a homeless man outside a café…"
                rows={3}
                style={{ width: "100%", background: "rgba(0,0,0,0.5)", border: "1px solid rgba(124,58,237,0.35)", borderRadius: 12, padding: "0.9rem 1.1rem", fontSize: 15, color: "#E8DEFF", fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box", lineHeight: 1.6 }}
              />

              {/* Duration */}
              <div style={{ marginTop: 16, marginBottom: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: 8 }}>Duration</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {([30, 60] as const).map(d => (
                    <button key={d} onClick={() => setTargetDuration(d)} style={{ flex: 1, padding: "9px 0", borderRadius: 10, fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", transition: "all 0.15s", background: targetDuration === d ? "rgba(201,168,76,0.2)" : "rgba(0,0,0,0.3)", border: targetDuration === d ? "1px solid rgba(201,168,76,0.7)" : "1px solid rgba(124,58,237,0.25)", color: targetDuration === d ? "#C9A84C" : "#9CA3AF" }}>{d}s</button>
                  ))}
                </div>
              </div>

              <button
                onClick={step === "idea" ? generateScripts : () => setStep("scripts")}
                disabled={loadingScripts || !idea.trim() || loadingContinue}
                className={!loadingScripts && idea.trim() ? "gold-btn" : undefined}
                style={{ marginTop: 14, width: "100%", padding: "14px", borderRadius: 12, fontSize: 15, fontWeight: 700, fontFamily: "inherit", border: "none", cursor: loadingScripts || !idea.trim() ? "not-allowed" : "pointer", opacity: !idea.trim() ? 0.5 : 1, background: loadingScripts ? "rgba(124,58,237,0.3)" : undefined, color: loadingScripts ? "#9CA3AF" : undefined, transition: "opacity 0.2s" }}
              >
                {loadingScripts ? "Writing scripts…" : step === "scripts" ? "Rewrite Scripts →" : "Write Scripts →"}
              </button>
            </div>

            {scriptError && (
              <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 12, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "#F87171" }}>⚠ {scriptError}</span>
                <button onClick={() => setScriptError(null)} style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: 16 }}>×</button>
              </div>
            )}

            {genError && (
              <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 12, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "#F87171" }}>⚠ {genError}</span>
                <button onClick={() => setGenError(null)} style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: 16 }}>×</button>
              </div>
            )}

            {/* Script picker */}
            {step === "scripts" && scripts.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: 14 }}>
                  Choose a script
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {scripts.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => startGeneration(s)}
                      style={{ background: "#1A1428", border: "1px solid rgba(124,58,237,0.35)", borderRadius: 18, padding: "1.25rem 1.5rem", cursor: "pointer", transition: "border-color 0.15s, background 0.15s" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(201,168,76,0.6)"; (e.currentTarget as HTMLDivElement).style.background = "#1E1632"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(124,58,237,0.35)"; (e.currentTarget as HTMLDivElement).style.background = "#1A1428"; }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#C9A84C" }}>{s.title}</span>
                        <span style={{ fontSize: 11, color: "#9CA3AF", whiteSpace: "nowrap", marginTop: 2 }}>3 scenes · 30s</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: "#C084FC", fontStyle: "italic", lineHeight: 1.5, marginBottom: 8 }}>
                        "{s.hook}"
                      </p>
                      <p style={{ margin: 0, fontSize: 13, color: "#9CA3AF", lineHeight: 1.6 }}>
                        {s.narration.length > 160 ? s.narration.slice(0, 157) + "…" : s.narration}
                      </p>
                      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#7C3AED", background: "rgba(124,58,237,0.12)", padding: "4px 12px", borderRadius: 20 }}>
                          Generate this →
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── DONE STEP ─────────────────────────────────────────────────────── */}
        {step === "done" && videoUrl && (
          <>
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: "clamp(1.8rem,5vw,2.8rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
                Your Video
              </h1>
            </div>
            <div style={{ background: "rgba(78,203,140,0.08)", border: "1px solid rgba(78,203,140,0.3)", borderRadius: 20, padding: "2rem", textAlign: "center" }}>
              <p style={{ color: "#4ECB8C", fontSize: 15, fontWeight: 600, marginBottom: 16 }}>✅ {selectedScript?.title ?? "Video"} — Generated</p>
              <video controls src={videoUrl} style={{ width: "100%", borderRadius: 14, background: "#000" }} />
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button
                  onClick={() => router.push("/videos")}
                  style={{ flex: 1, background: "rgba(192,132,252,0.12)", border: "1px solid rgba(192,132,252,0.35)", borderRadius: 10, padding: "10px 0", color: "#C084FC", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                >My Videos →</button>
                <button
                  onClick={() => { setStep("idea"); setVideoUrl(null); setIdea(""); setScripts([]); setContinueCtx(null); }}
                  style={{ flex: 1, background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.35)", borderRadius: 10, padding: "10px 0", color: "#C9A84C", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                >Generate Another →</button>
              </div>
            </div>
          </>
        )}
      </div>

      <GenerationProgress
        isGenerating={step === "generating"}
        currentStage={stage}
        progress={progress}
        estimatedTimeLeft={estimatedTimeLeft}
        error={genError ?? undefined}
        onCancel={cancelGeneration}
      />
    </div>
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#0F0A1F", display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF" }}>
        Loading…
      </div>
    }>
      <GeneratePageInner />
    </Suspense>
  );
}
