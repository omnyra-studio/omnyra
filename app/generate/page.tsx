"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AnimatedBackground from "@/components/AnimatedBackground";
import GenerationProgress from "@/components/GenerationProgress";
import UpgradeModal from "@/components/UpgradeModal";
import Link from "next/link";
import { canAccess60s } from "@/lib/utils/tier-utils";
import { chooseRunwayModel, type SpeedMode } from "@/lib/ai/runway-router";
import type { UserTier } from "@/lib/types/tiers";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScriptOption {
  id:           string;
  title:        string;
  hook:         string;
  narration:    string;
  scenePrompts: [string, string, string];
}

interface Concept {
  title:       string;
  description: string;
  ghostScore:  number;
  imageUrl:    string;
}

interface ElevenLabsVoice {
  voice_id:    string;
  name:        string;
  preview_url: string;
  labels?: {
    accent?:      string;
    description?: string;
    use_case?:    string;
    gender?:      string;
    age?:         string;
  };
}

type PageStep = "goal" | "script" | "images" | "voice" | "generating" | "done";

const STAGES = [
  { name: "Analyze",  weight: 0.08 },
  { name: "Script",   weight: 0.12 },
  { name: "Generate", weight: 0.55 },
  { name: "Voice",    weight: 0.15 },
  { name: "Stitch",   weight: 0.10 },
] as const;

const NICHE_OPTIONS = [
  { value: "",              label: "— Any niche —" },
  { value: "motivation",    label: "Motivation / Success" },
  { value: "finance",       label: "Personal Finance" },
  { value: "side-hustles",  label: "Side Hustles" },
  { value: "fitness",       label: "Health & Fitness" },
  { value: "beauty",        label: "Beauty / Skincare" },
  { value: "food",          label: "Food & Recipes" },
  { value: "faceless",      label: "Faceless / Stoic" },
  { value: "luxury",        label: "Luxury Lifestyle" },
  { value: "tech",          label: "Technology & AI" },
  { value: "mental-health", label: "Mental Health" },
  { value: "history",       label: "History / Documentary" },
  { value: "travel",        label: "Travel" },
  { value: "spirituality",  label: "Spirituality & Mindset" },
  { value: "animation",     label: "3D Animation" },
];

const C = {
  bg:     "#0F0A1F",
  card:   "#1A1428",
  border: "rgba(124,58,237,0.35)",
  text:   "#E8DEFF",
  sub:    "#9CA3AF",
  violet: "#7C3AED",
  gold:   "#C9A84C",
  green:  "#4ECB8C",
  red:    "#F87171",
  purple: "#C084FC",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: C.sub, marginBottom: 10 }}>
      {children}
    </div>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 13, color: C.red }}>⚠ {message}</span>
      <button onClick={onDismiss} style={{ background: "none", border: "none", color: C.sub, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
    </div>
  );
}

function StepDots({ current }: { current: PageStep }) {
  const steps: PageStep[] = ["goal", "script", "images", "voice", "generating"];
  const labels = ["Idea", "Script", "Image", "Voice", "Generate"];
  const activeIdx = steps.indexOf(current === "done" ? "generating" : current);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 32 }}>
      {steps.map((s, i) => (
        <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{
              width: 26, height: 26, borderRadius: "50%",
              background: i <= activeIdx ? `${C.gold}22` : "rgba(255,255,255,0.04)",
              border: `2px solid ${i <= activeIdx ? C.gold : "rgba(255,255,255,0.1)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700,
              color: i <= activeIdx ? C.gold : C.sub,
              transition: "all 0.2s",
            }}>
              {i < activeIdx ? "✓" : i + 1}
            </div>
            <span style={{ fontSize: 9, color: i <= activeIdx ? C.gold : C.sub, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {labels[i]}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ width: 20, height: 1, background: i < activeIdx ? `${C.gold}50` : "rgba(255,255,255,0.1)", marginBottom: 14, transition: "all 0.2s" }} />
          )}
        </div>
      ))}
    </div>
  );
}

function PrimaryBtn({ onClick, disabled, children }: { onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={!disabled ? "gold-btn" : undefined}
      style={{
        width: "100%", padding: "14px", borderRadius: 12, border: "none",
        fontSize: 15, fontWeight: 700, fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        background: disabled ? "rgba(124,58,237,0.2)" : undefined,
        color: disabled ? C.sub : undefined,
        transition: "opacity 0.2s",
      }}
    >
      {children}
    </button>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", color: C.sub, cursor: "pointer", fontSize: 13, padding: 0, display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 20 }}>
      ← Back
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function GeneratePageInner() {
  const searchParams = useSearchParams();
  const router       = useRouter();

  const [step,           setStep]           = useState<PageStep>("goal");
  const [idea,           setIdea]           = useState("");
  const [niche,          setNiche]          = useState("");
  const [targetDuration, setTargetDuration] = useState<30 | 60>(30);
  const [speedMode,      setSpeedMode]      = useState<SpeedMode>("fast");
  const [userTier,       setUserTier]       = useState<UserTier>("free");
  const [showUpgrade,    setShowUpgrade]    = useState(false);

  const [scripts,        setScripts]        = useState<ScriptOption[]>([]);
  const [selectedScript, setSelectedScript] = useState<ScriptOption | null>(null);
  const [loadingScripts, setLoadingScripts] = useState(false);

  const [concepts,      setConcepts]      = useState<Concept[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [loadingImages, setLoadingImages] = useState(false);

  const [voices,          setVoices]          = useState<ElevenLabsVoice[]>([]);
  const [selectedVoice,   setSelectedVoice]   = useState("");
  const [loadingVoices,   setLoadingVoices]   = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);

  const [stage,             setStage]             = useState("");
  const [progress,          setProgress]          = useState(0);
  const [estimatedTimeLeft, setEstimatedTimeLeft] = useState(0);
  const [videoUrl,          setVideoUrl]          = useState<string | null>(null);
  const [error,             setError]             = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then(r => r.ok ? r.json() : null)
      .then((d: { plan?: UserTier } | null) => { if (d?.plan) setUserTier(d.plan); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoadingVoices(true);
    fetch("/api/voices")
      .then(r => r.json())
      .then((d: { voices?: ElevenLabsVoice[] }) => {
        const vs = d.voices ?? [];
        setVoices(vs);
        if (vs.length > 0) setSelectedVoice(vs[0].voice_id);
      })
      .catch(() => {})
      .finally(() => setLoadingVoices(false));
  }, []);

  const continueFrom = searchParams.get("continueFrom");
  useEffect(() => {
    if (!continueFrom) return;
    fetch("/api/continue-story", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      .then(r => r.json())
      .then((d: { script?: string }) => { if (d.script) setIdea(d.script); })
      .catch(() => {});
  }, [continueFrom]);

  useEffect(() => () => {
    abortRef.current?.abort();
    audioRef.current?.pause();
  }, []);

  // ── Step 1 → 2: Generate scripts ────────────────────────────────────────────
  async function generateScripts() {
    if (!idea.trim() || loadingScripts) return;
    setLoadingScripts(true);
    setError(null);
    setScripts([]);
    setSelectedScript(null);
    try {
      const res = await fetch("/api/generate-scripts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: idea.trim(), niche: niche || undefined }),
      });
      const data = await res.json() as { scripts?: ScriptOption[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setScripts(data.scripts ?? []);
      setStep("script");
    } catch (e) {
      setError((e as Error).message ?? "Failed to generate scripts.");
    } finally {
      setLoadingScripts(false);
    }
  }

  // ── Step 2 → 3: Generate concept images ─────────────────────────────────────
  async function generateImages(script: ScriptOption) {
    setSelectedScript(script);
    setLoadingImages(true);
    setError(null);
    setConcepts([]);
    setSelectedImage(null);
    setStep("images");
    try {
      const res = await fetch("/api/generate-concepts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt:          `${script.hook}\n\n${script.narration}`,
          characterBrief:  idea.trim(),
          toolId:          "general",
          nichePrefill:    niche || "",
          lightningMode:   false,
          visualStyle:     "Lifestyle",
          aspectRatio:     "9:16",
          quality:         speedMode === "fast" ? "fast" : "standard",
          subjectEthnicity: "caucasian",
          numImages:       4,
        }),
      });
      const data = await res.json() as { concepts?: Concept[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      const c = data.concepts ?? [];
      setConcepts(c);
      if (c.length > 0) setSelectedImage(c[0].imageUrl);
    } catch (e) {
      setError((e as Error).message ?? "Image generation failed.");
    } finally {
      setLoadingImages(false);
    }
  }

  // ── Step 4 → 5: Generate video ───────────────────────────────────────────────
  const simulateProgress = useCallback(async (abort: AbortController) => {
    let pct = 0;
    const totalMs = targetDuration === 60 ? 280_000 : 160_000;
    for (const s of STAGES) {
      if (abort.signal.aborted) return;
      setStage(s.name);
      const steps   = 15;
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

  async function generateVideo() {
    if (!selectedScript) return;
    if (targetDuration === 60 && !canAccess60s(userTier)) {
      setShowUpgrade(true);
      return;
    }

    const routing = chooseRunwayModel(selectedScript.narration, userTier, speedMode);
    const abort   = new AbortController();
    abortRef.current = abort;

    setStep("generating");
    setError(null);
    setProgress(0);
    setVideoUrl(null);
    simulateProgress(abort);

    try {
      const res = await fetch("/api/generate-cinematic-sequence", {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          scenePrompts:  selectedScript.scenePrompts,
          voiceoverText: selectedScript.narration,
          imageUrl:      selectedImage,
          sceneImages:   selectedImage ? [selectedImage, selectedImage, selectedImage] : [],
          voiceId:       selectedVoice || undefined,
          targetDuration,
          niche:         niche || undefined,
          speedMode,
          model:         routing.model,
        }),
      });

      abort.abort();
      setProgress(100);

      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as { videoUrl?: string; video_url?: string; stitched_url?: string; finalVideoUrl?: string };
      const url  = data.videoUrl ?? data.video_url ?? data.stitched_url ?? data.finalVideoUrl ?? null;
      if (!url) throw new Error("No video URL returned — check server logs.");

      setVideoUrl(url);
      setStep("done");
    } catch (e) {
      abortRef.current?.abort();
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message ?? "Generation failed.");
      setStep("voice");
    }
  }

  function cancelGeneration() {
    abortRef.current?.abort();
    setStep("voice");
    setProgress(0);
    setStage("");
  }

  function playPreview(url: string, voiceId: string) {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      if (previewingVoice === voiceId) { setPreviewingVoice(null); return; }
    }
    const a = new Audio(url);
    audioRef.current = a;
    setPreviewingVoice(voiceId);
    a.play().catch(() => {});
    a.onended = () => { setPreviewingVoice(null); audioRef.current = null; };
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, position: "relative" }}>
      <AnimatedBackground />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 680, margin: "0 auto", padding: "clamp(1.5rem,5vw,4rem) 1.5rem 8rem" }}>

        <Link href="/dashboard" style={{ fontSize: 13, color: C.sub, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 32 }}>
          ← Dashboard
        </Link>

        {step !== "generating" && step !== "done" && <StepDots current={step} />}

        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {/* ── STEP 1: GOAL ──────────────────────────────────────────────────── */}
        {step === "goal" && (
          <>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: "clamp(1.8rem,5vw,2.8rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: 0, lineHeight: 1.1 }}>
                Generate Video
              </h1>
              <p style={{ fontSize: 15, color: C.sub, marginTop: 8 }}>
                Describe your idea — we write 5 scripts, you pick one and a scene image.
              </p>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 24, padding: "clamp(1.2rem,4vw,2rem)", display: "flex", flexDirection: "column", gap: 18 }}>

              <div>
                <SectionLabel>Your idea *</SectionLabel>
                <textarea
                  value={idea}
                  onChange={e => setIdea(e.target.value)}
                  placeholder="A quiet moment of kindness on a city street at golden hour…"
                  rows={3}
                  style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "0.9rem 1.1rem", fontSize: 15, color: C.text, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box", lineHeight: 1.6 }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <SectionLabel>Video niche</SectionLabel>
                  <select
                    value={niche}
                    onChange={e => setNiche(e.target.value)}
                    style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: "9px 12px", fontSize: 13 }}
                  >
                    {NICHE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                <div>
                  <SectionLabel>Duration</SectionLabel>
                  <div style={{ display: "flex", gap: 8 }}>
                    {([30, 60] as const).map(d => (
                      <button key={d} onClick={() => setTargetDuration(d)} style={{ flex: 1, padding: "9px 0", borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", transition: "all 0.15s", background: targetDuration === d ? `${C.gold}22` : "rgba(0,0,0,0.3)", border: `1px solid ${targetDuration === d ? C.gold : "rgba(124,58,237,0.25)"}`, color: targetDuration === d ? C.gold : C.sub }}>
                        {d}s
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <SectionLabel>Speed mode</SectionLabel>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["fast", "quality"] as const).map(m => (
                    <button key={m} onClick={() => setSpeedMode(m)} style={{ flex: 1, padding: "9px 0", borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", transition: "all 0.15s", background: speedMode === m ? "rgba(124,58,237,0.18)" : "rgba(0,0,0,0.3)", border: `1px solid ${speedMode === m ? C.violet : "rgba(124,58,237,0.25)"}`, color: speedMode === m ? "#a78bfa" : C.sub }}>
                      {m === "fast" ? "⚡ Fast (~90s)" : "✦ Quality (~3min)"}
                    </button>
                  ))}
                </div>
              </div>

              <PrimaryBtn onClick={generateScripts} disabled={!idea.trim() || loadingScripts}>
                {loadingScripts ? "Writing scripts…" : "Write Scripts →"}
              </PrimaryBtn>
            </div>
          </>
        )}

        {/* ── STEP 2: SCRIPT PICKER ─────────────────────────────────────────── */}
        {step === "script" && (
          <>
            <BackBtn onClick={() => setStep("goal")} />
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: "clamp(1.4rem,4vw,2rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
                Choose a Script
              </h2>
              <p style={{ fontSize: 14, color: C.sub, marginTop: 6 }}>
                Pick one — we'll generate 4 scene images for it next.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {scripts.map(s => (
                <div
                  key={s.id}
                  onClick={() => generateImages(s)}
                  style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: "1.25rem 1.5rem", cursor: "pointer", transition: "border-color 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = `${C.gold}80`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = C.border; }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.gold }}>{s.title}</span>
                    <span style={{ fontSize: 11, color: C.sub, whiteSpace: "nowrap", marginTop: 2 }}>3 scenes · {targetDuration}s</span>
                  </div>
                  <p style={{ margin: "0 0 8px", fontSize: 13, color: C.purple, fontStyle: "italic", lineHeight: 1.5 }}>
                    "{s.hook}"
                  </p>
                  <p style={{ margin: 0, fontSize: 13, color: C.sub, lineHeight: 1.6 }}>
                    {s.narration.length > 160 ? s.narration.slice(0, 157) + "…" : s.narration}
                  </p>
                  <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.violet, background: `${C.violet}18`, padding: "4px 12px", borderRadius: 20 }}>
                      Use this →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── STEP 3: IMAGE PICKER ──────────────────────────────────────────── */}
        {step === "images" && (
          <>
            <BackBtn onClick={() => setStep("script")} />
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: "clamp(1.4rem,4vw,2rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
                Pick a Scene Image
              </h2>
              <p style={{ fontSize: 14, color: C.sub, marginTop: 6 }}>
                This anchors all 3 clips. Kling uses it as the reference frame for consistency.
              </p>
            </div>

            {loadingImages ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "60px 0" }}>
                <div style={{ width: 40, height: 40, border: `3px solid ${C.gold}30`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <span style={{ color: C.sub, fontSize: 14 }}>Generating scene concepts…</span>
              </div>
            ) : (
              <>
                {concepts.length > 0 ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 20 }}>
                    {concepts.map((c, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedImage(c.imageUrl)}
                        style={{
                          padding: 0, border: `2px solid ${selectedImage === c.imageUrl ? C.gold : "transparent"}`,
                          borderRadius: 12, cursor: "pointer", background: "none", overflow: "hidden",
                          position: "relative", aspectRatio: "9/16",
                          boxShadow: selectedImage === c.imageUrl ? `0 0 0 2px ${C.gold}40` : "none",
                          transition: "border-color 0.15s",
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.imageUrl} alt={c.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        {selectedImage === c.imageUrl && (
                          <div style={{ position: "absolute", inset: 0, background: `${C.gold}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>✓</div>
                        )}
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent,rgba(0,0,0,0.75))", padding: "20px 8px 8px" }}>
                          <span style={{ fontSize: 11, color: "#fff", fontWeight: 600 }}>{c.title}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ background: `${C.border}18`, border: `1px dashed ${C.border}`, borderRadius: 12, padding: "32px 16px", textAlign: "center", marginBottom: 20 }}>
                    <p style={{ color: C.sub, fontSize: 13, margin: 0 }}>No images generated — you can proceed without a reference image.</p>
                  </div>
                )}

                <PrimaryBtn onClick={() => setStep("voice")}>
                  {selectedImage ? "Use Selected Image →" : "Skip — No Reference Image →"}
                </PrimaryBtn>
              </>
            )}
          </>
        )}

        {/* ── STEP 4: VOICE PICKER ──────────────────────────────────────────── */}
        {step === "voice" && (
          <>
            <BackBtn onClick={() => setStep("images")} />
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: "clamp(1.4rem,4vw,2rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
                Choose a Voice
              </h2>
              <p style={{ fontSize: 14, color: C.sub, marginTop: 6 }}>
                Click ▶ to preview. This voiceover is merged into your final video.
              </p>
            </div>

            {loadingVoices ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
                <span style={{ color: C.sub, fontSize: 14 }}>Loading voices…</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20, maxHeight: 340, overflowY: "auto" }}>
                {voices.map(v => (
                  <div
                    key={v.voice_id}
                    onClick={() => setSelectedVoice(v.voice_id)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, background: selectedVoice === v.voice_id ? `${C.violet}18` : "rgba(255,255,255,0.03)", border: `1px solid ${selectedVoice === v.voice_id ? C.violet : "rgba(255,255,255,0.08)"}`, cursor: "pointer", transition: "all 0.15s" }}
                  >
                    <button
                      onClick={e => { e.stopPropagation(); playPreview(v.preview_url, v.voice_id); }}
                      style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", background: previewingVoice === v.voice_id ? `${C.violet}30` : "rgba(255,255,255,0.06)", border: `1px solid ${previewingVoice === v.voice_id ? C.violet : "rgba(255,255,255,0.1)"}`, color: C.text, cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      {previewingVoice === v.voice_id ? "■" : "▶"}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: selectedVoice === v.voice_id ? "#a78bfa" : C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {v.name}
                      </div>
                      {(v.labels?.accent || v.labels?.description) && (
                        <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                          {[v.labels?.accent, v.labels?.description].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    {selectedVoice === v.voice_id && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#a78bfa", flexShrink: 0 }} />}
                  </div>
                ))}
              </div>
            )}

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 18px", marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: C.sub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Ready to generate</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12 }}>
                <span style={{ color: C.gold }}>✦ {selectedScript?.title ?? "Script"}</span>
                <span style={{ color: C.sub }}>·</span>
                <span style={{ color: C.sub }}>{targetDuration}s · {speedMode === "fast" ? "⚡ Fast" : "✦ Quality"}</span>
                {selectedImage && <><span style={{ color: C.sub }}>·</span><span style={{ color: C.green }}>📸 Image anchored</span></>}
                {selectedVoice && <><span style={{ color: C.sub }}>·</span><span style={{ color: "#a78bfa" }}>🎙 Voice ready</span></>}
              </div>
            </div>

            <PrimaryBtn onClick={generateVideo} disabled={!selectedScript}>
              Generate Video ✦
            </PrimaryBtn>
          </>
        )}

        {/* ── DONE ──────────────────────────────────────────────────────────── */}
        {step === "done" && videoUrl && (
          <>
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: "clamp(1.8rem,5vw,2.8rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
                Your Video
              </h1>
            </div>
            <div style={{ background: "rgba(78,203,140,0.08)", border: "1px solid rgba(78,203,140,0.3)", borderRadius: 20, padding: "2rem", textAlign: "center" }}>
              <p style={{ color: C.green, fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
                ✅ {selectedScript?.title ?? "Video"} — Ready
              </p>
              <video controls src={videoUrl} style={{ width: "100%", maxWidth: 360, borderRadius: 14, background: "#000", display: "block", margin: "0 auto" }} />
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button onClick={() => router.push("/videos")} style={{ flex: 1, background: `${C.purple}18`, border: `1px solid ${C.purple}50`, borderRadius: 10, padding: "10px 0", color: C.purple, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                  My Videos →
                </button>
                <a href={videoUrl} download="omnyra-video.mp4" style={{ flex: 1, background: `${C.gold}18`, border: `1px solid ${C.gold}50`, borderRadius: 10, padding: "10px 0", color: C.gold, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  Download ↓
                </a>
              </div>
              <button
                onClick={() => { setStep("goal"); setVideoUrl(null); setIdea(""); setScripts([]); setConcepts([]); setSelectedImage(null); setSelectedScript(null); }}
                style={{ marginTop: 12, background: "none", border: "none", color: C.sub, fontSize: 13, cursor: "pointer" }}
              >
                Start over
              </button>
            </div>
          </>
        )}
      </div>

      <GenerationProgress
        isGenerating={step === "generating"}
        currentStage={stage}
        progress={progress}
        estimatedTimeLeft={estimatedTimeLeft}
        error={step === "generating" ? (error ?? undefined) : undefined}
        onCancel={cancelGeneration}
      />

      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        feature="60-second videos"
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
