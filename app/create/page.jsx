"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { DirectorMode } from "../../components/director-mode";
import { findTemplate } from "../../lib/templates";
import { DraftStage } from "../../components/pipeline-stages";

const PLATFORMS = ["TikTok", "Instagram", "YouTube Shorts"];
const GOALS = ["Get clicks", "Build trust", "Go viral", "Sell product"];
const DURATIONS = [15, 30, 45, 60];

function Label({ children }) {
  return (
    <span className="text-xs uppercase tracking-widest text-white/40 mb-2 block">
      {children}
    </span>
  );
}

function Pills({ options, value, onChange, fmt }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const label = fmt ? fmt(opt) : String(opt);
        const on = value === opt;
        return (
          <button
            key={String(opt)}
            onClick={() => onChange(on ? null : opt)}
            className={[
              "px-4 py-2 rounded-full text-sm font-medium transition-all duration-200",
              on
                ? "bg-violet-600 text-white shadow-[0_0_20px_rgba(139,92,246,0.4)]"
                : "border border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:bg-white/10 hover:text-white/80",
            ].join(" ")}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function StageBar({ current }) {
  const stages = ["Brief", "Director", "Render"];
  return (
    <div className="flex items-center mb-10">
      {stages.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={[
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300",
                  done
                    ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-400"
                    : active
                      ? "bg-violet-600/30 border border-violet-500 text-violet-300 shadow-[0_0_16px_rgba(139,92,246,0.5)]"
                      : "bg-white/5 border border-white/10 text-white/20",
                ].join(" ")}
              >
                {done ? "✓" : n}
              </div>
              <span
                className={[
                  "text-[10px] tracking-widest uppercase whitespace-nowrap",
                  active ? "text-violet-400" : done ? "text-emerald-400/70" : "text-white/20",
                ].join(" ")}
              >
                {label}
              </span>
            </div>
            {i < stages.length - 1 && (
              <div
                className={[
                  "h-px w-8 sm:w-14 mx-1 mb-5 transition-colors duration-300",
                  done ? "bg-emerald-500/40" : "bg-white/10",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function CreatePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get("template");
  const onboardingMode = searchParams.get("onboarding") === "true";
  const initialRenderId = searchParams.get("render");
  const template = useMemo(() => findTemplate(templateId), [templateId]);

  const [token, setToken] = useState(null);
  const [renderId, setRenderId] = useState(initialRenderId || null);
  const [stage, setStage] = useState(initialRenderId ? 3 : 1);

  const [hideBanner, setHideBanner] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Brief state — defaults from template + onboarding seed values
  const initialProduct  = onboardingMode ? "My product or service" : "";
  const initialAudience = onboardingMode ? "My target audience"     : "";
  const initialPlatform = onboardingMode ? "TikTok"                 : null;
  const initialGoal     = onboardingMode ? "Go viral"               : null;
  const initialDuration = onboardingMode ? 30 : (template?.default_duration ?? null);

  const [product, setProduct]   = useState(initialProduct);
  const [audience, setAudience] = useState(initialAudience);
  const [platform, setPlatform] = useState(initialPlatform);
  const [goal, setGoal]         = useState(initialGoal);
  const [duration, setDuration] = useState(initialDuration);

  const [director, setDirector] = useState({
    energy: onboardingMode ? "high-energy" : (template?.default_energy ?? null),
    camera: onboardingMode ? "selfie"      : (template?.default_camera ?? null),
    style:  onboardingMode ? "girl-talk"   : (template?.default_style  ?? null),
  });

  useEffect(() => {
    supabase.auth?.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push("/signin");
        return;
      }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => {
    if (!template) return;
    setDuration((d) => d ?? template.default_duration);
    setDirector((prev) => ({
      energy: prev.energy ?? template.default_energy,
      camera: prev.camera ?? template.default_camera,
      style:  prev.style  ?? template.default_style,
    }));
  }, [template]);

  const canProceed1 = product.trim() && audience.trim() && platform && goal && duration;

  function hdrs() {
    return {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }

  async function submitBrief() {
    if (!canProceed1) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/pipeline/render", {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({
          template: template?.id ?? templateId ?? "",
          brief: {
            product: product.trim(),
            audience: audience.trim(),
            platform: String(platform).toLowerCase().replace(/\s+/g, ""),
            goal,
            duration: Number(duration),
          },
          director_settings: director,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to start render");
      }
      const newId = data.render_id;
      setRenderId(newId);
      const params = new URLSearchParams(searchParams.toString());
      params.set("render", newId);
      router.replace(`/create?${params.toString()}`);
      setStage(3);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function approveRender() {
    if (!renderId || !token) return;
    try {
      const res = await fetch(`/api/pipeline/render/${renderId}/approve`, {
        method: "POST",
        headers: hdrs(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data.message || data.error || "Approve failed");
      }
    } catch (err) {
      setSubmitError(err.message);
    }
  }

  async function regenerateScript() {
    if (!renderId || !token) return;
    try {
      const res = await fetch(`/api/pipeline/render/${renderId}/regenerate`, {
        method: "POST",
        headers: hdrs(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data.message || data.error || "Regenerate failed");
      }
    } catch (err) {
      setSubmitError(err.message);
    }
  }

  function resetAndStartOver() {
    setRenderId(null);
    setStage(1);
    setSubmitError("");
    // Strip render id from URL but keep template / onboarding params.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("render");
    router.replace(`/create${params.toString() ? `?${params.toString()}` : ""}`);
  }

  function goBackFromDraft() {
    // Allow user to step back to director without losing the render row
    // (the row is still in 'draft' state; they can re-approve later).
    setStage(2);
  }

  const inputCls =
    "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-violet-500/50 transition-all duration-200";

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f" }} className="text-white">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="mb-10">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-white/30 hover:text-white/60 text-sm transition-colors mb-6 flex items-center gap-2"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">Create</h1>
          <p className="text-white/40 text-sm mt-1">Director-grade content. In seconds.</p>
        </div>

        {onboardingMode && !hideBanner && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-200 text-sm flex items-center justify-between gap-3">
            <span>👋 Welcome! This first video uses your free credits.</span>
            <button
              onClick={() => setHideBanner(true)}
              className="text-violet-200/60 hover:text-violet-100 text-lg leading-none"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        <StageBar current={stage} />

        {submitError && (
          <div className="mb-6 rounded-xl p-4 border border-rose-500/20 bg-rose-500/10">
            <p className="text-rose-300 text-sm">{submitError}</p>
          </div>
        )}

        {/* ── STAGE 1: BRIEF ─────────────────────────────────── */}
        {stage === 1 && (
          <div className="space-y-8">
            <div>
              <Label>What are you creating?</Label>
              <input
                type="text"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="skincare product, SaaS tool, personal brand..."
                className={inputCls}
              />
            </div>
            <div>
              <Label>Who&apos;s watching?</Label>
              <input
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="Gen Z women, startup founders, fitness guys..."
                className={inputCls}
              />
            </div>
            <div>
              <Label>Platform</Label>
              <Pills options={PLATFORMS} value={platform} onChange={setPlatform} />
            </div>
            <div>
              <Label>Goal</Label>
              <Pills options={GOALS} value={goal} onChange={setGoal} />
            </div>
            <div>
              <Label>Length</Label>
              <Pills
                options={DURATIONS}
                value={duration}
                onChange={setDuration}
                fmt={(d) => `${d}s`}
              />
            </div>
            <button
              onClick={() => setStage(2)}
              disabled={!canProceed1}
              className={[
                "w-full py-3.5 rounded-xl font-medium text-sm transition-all duration-200",
                canProceed1
                  ? "bg-violet-600 hover:bg-violet-500 text-white shadow-[0_0_24px_rgba(139,92,246,0.3)]"
                  : "bg-white/5 text-white/20 cursor-not-allowed",
              ].join(" ")}
            >
              Set the Direction →
            </button>
          </div>
        )}

        {/* ── STAGE 2: DIRECTOR MODE ──────────────────────────── */}
        {stage === 2 && (
          <div className="space-y-8 relative">
            {onboardingMode && !hideBanner && (
              <div className="absolute -top-3 right-0 bg-violet-900/80 text-white text-xs rounded-lg px-3 py-2 z-50 max-w-[260px] shadow-[0_10px_30px_rgba(0,0,0,0.4)]">
                These settings shape how your video feels. Try High-energy + Selfie + Girl-talk for UGC ads.
              </div>
            )}
            <DirectorMode onChange={setDirector} />
            <div className="flex gap-3">
              <button
                onClick={() => setStage(1)}
                className="flex-1 py-3.5 rounded-xl font-medium text-sm border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80 transition-all duration-200"
              >
                ← Back
              </button>
              <button
                onClick={submitBrief}
                disabled={submitting || !canProceed1}
                className={[
                  "flex-[2] py-3.5 rounded-xl font-medium text-sm transition-all duration-200",
                  submitting || !canProceed1
                    ? "bg-white/5 text-white/20 cursor-not-allowed"
                    : "bg-violet-600 hover:bg-violet-500 text-white shadow-[0_0_24px_rgba(139,92,246,0.3)]",
                ].join(" ")}
              >
                {submitting ? "Generating…" : "Generate Draft →"}
              </button>
            </div>
          </div>
        )}

        {/* ── STAGE 3: DraftStage (event-driven) ─────────────── */}
        {stage === 3 && (
          <DraftStage
            renderId={renderId}
            onApprove={approveRender}
            onRegenerate={regenerateScript}
            onBack={goBackFromDraft}
            onReset={resetAndStartOver}
          />
        )}
      </div>
    </div>
  );
}

export default function CreatePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0a0f] text-white/40 text-sm flex items-center justify-center">
          Loading…
        </div>
      }
    >
      <CreatePageInner />
    </Suspense>
  );
}
