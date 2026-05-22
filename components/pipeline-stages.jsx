"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Check,
  CheckCircle2,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
  Download,
  Share2,
  Link as LinkIcon,
  Twitter,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/* ──────────────────────────────────────────────────────────────────
 *  Constants — render_events vocabulary owned by lib/render-engine.ts
 * ───────────────────────────────────────────────────────────────── */

const GENERATING_MESSAGES = [
  "Analysing your brief...",
  "Writing your hook...",
  "Directing your scenes...",
  "Setting the emotional tone...",
  "Crafting your performance...",
];

const STAGE_LABELS = [
  { key: "script", label: "Script locked" },
  { key: "voice", label: "Generating voice with ElevenLabs" },
  { key: "motion", label: "Generating motion" },
  { key: "lipsync", label: "Syncing lip movement" },
  { key: "finalise", label: "Finalising render" },
];

const DIRECTOR_EMOJI = {
  energy: "⚡",
  camera: "📱",
  tone: "💬",
  style: "🎬",
};

/* ──────────────────────────────────────────────────────────────────
 *  Event → UI state derivation (pure)
 * ───────────────────────────────────────────────────────────────── */

function lastEvent(events) {
  return events.length === 0 ? null : events[events.length - 1];
}

function derivePhase(events, render) {
  if (!events || events.length === 0) {
    if (render?.status === "complete") return "complete";
    if (render?.status === "failed") return "draft";
    if (render?.script) return "draft";
    return "generating";
  }
  const last = lastEvent(events);
  switch (last.event_type) {
    case "render_finalised":
      return "complete";
    case "render_failed":
      return "draft";
    case "render_created":
    case "brief_validated":
      return render?.script ? "draft" : "generating";
    case "script_generated":
      return "draft";
    case "voice_started":
    case "voice_completed":
    case "motion_started":
    case "motion_completed":
    case "lipsync_started":
    case "lipsync_completed":
      return "rendering";
    default:
      return "generating";
  }
}

function deriveStepStatus(events) {
  const have = new Set(events.map((e) => e.event_type));
  function statusOf(startEv, doneEv) {
    if (have.has(doneEv)) return "complete";
    if (have.has(startEv)) return "active";
    return "pending";
  }
  return {
    script: have.has("script_generated") ? "complete" : "pending",
    voice: statusOf("voice_started", "voice_completed"),
    motion: statusOf("motion_started", "motion_completed"),
    lipsync: statusOf("lipsync_started", "lipsync_completed"),
    finalise: have.has("render_finalised")
      ? "complete"
      : have.has("lipsync_completed")
        ? "active"
        : "pending",
  };
}

function deriveFailure(events, render) {
  const failure = [...events].reverse().find((e) => e.event_type === "render_failed");
  if (failure) return failure.payload?.message ?? "render failed";
  if (render?.status === "failed") return render.error_message ?? "render failed";
  return null;
}

/* ──────────────────────────────────────────────────────────────────
 *  Sub-components
 * ───────────────────────────────────────────────────────────────── */

function GeneratingDots() {
  return (
    <div className="flex items-center justify-center gap-2.5" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-3 h-3 rounded-full bg-violet-500 animate-bounce"
          style={{ animationDelay: `${i * 180}ms` }}
        />
      ))}
    </div>
  );
}

function GeneratingState() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setIdx((i) => (i + 1) % GENERATING_MESSAGES.length),
      2000,
    );
    return () => clearInterval(id);
  }, []);
  return (
    <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
      <div className="py-6">
        <GeneratingDots />
        <p
          key={idx}
          className="text-lg text-white/80 font-medium mt-8 transition-opacity duration-500"
        >
          {GENERATING_MESSAGES[idx]}
        </p>
        <p className="text-sm text-white/30 mt-2">
          Omnyra is directing your content
        </p>
      </div>
    </div>
  );
}

function DirectorPill({ kind, value }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-white/40 border border-white/10 px-3 py-1 rounded-full">
      <span aria-hidden>{DIRECTOR_EMOJI[kind]}</span>
      <span>{String(value)}</span>
    </span>
  );
}

function DraftState({ render, failureMessage, onApprove, onRegenerate, onBack }) {
  const script = render?.script ?? "";
  const director = render?.director_settings ?? {};
  const estimatedCredits = render?.brief?.duration
    ? Math.round(20 + ((Number(render.brief.duration) || 15) / 15) * 8)
    : null;

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-violet-300 border border-violet-500/40 bg-violet-500/5 px-3 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
          Draft Preview
        </span>
        <button
          onClick={() => onRegenerate?.()}
          className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
        >
          Regenerate
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {failureMessage && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 text-sm text-rose-200">
          Previous render failed: {failureMessage}. Regenerate the draft or approve to retry.
        </div>
      )}

      <div className="relative bg-white/5 border border-white/10 rounded-2xl p-6 overflow-hidden">
        <pre className="font-mono text-sm text-white/80 leading-relaxed whitespace-pre-wrap relative z-10 max-h-[420px] overflow-y-auto">
          {script || "Your draft script will appear here."}
        </pre>
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
        >
          <span className="text-8xl font-black text-white/5 rotate-[-20deg] whitespace-nowrap tracking-[0.2em]">
            DRAFT
          </span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DirectorPill kind="energy" value={director.energy} />
        <DirectorPill kind="camera" value={director.camera} />
        <DirectorPill kind="style" value={director.style} />
      </div>

      {estimatedCredits !== null && (
        <div className="rounded-2xl bg-white/3 border border-white/10 p-5 text-sm text-white/70">
          Estimated cost:{" "}
          <span className="text-white font-semibold tabular-nums">
            {estimatedCredits}
          </span>{" "}
          credits
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={() => onBack?.()}
          className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white text-sm font-medium transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Change Direction
        </button>
        <button
          onClick={() => onApprove?.()}
          className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-all shadow-[0_0_30px_rgba(139,92,246,0.35)]"
        >
          Approve &amp; Render
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function StepRow({ label, status }) {
  const isActive = status === "active";
  const isComplete = status === "complete";
  return (
    <div
      className={[
        "flex items-center gap-3 text-sm transition-all duration-500",
        isActive
          ? "text-violet-400 translate-x-0 opacity-100"
          : isComplete
            ? "text-emerald-400 translate-x-0 opacity-100"
            : "text-white/30 opacity-70 -translate-x-0.5",
      ].join(" ")}
    >
      <span className="w-5 h-5 flex items-center justify-center shrink-0">
        {isComplete ? (
          <Check className="w-4 h-4" />
        ) : isActive ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <span className="w-3.5 h-3.5 rounded-full border border-white/15 block" />
        )}
      </span>
      <span className="flex-1 leading-snug">{label}</span>
    </div>
  );
}

function RenderingState({ events }) {
  const stepStatus = useMemo(() => deriveStepStatus(events), [events]);
  return (
    <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-7 space-y-4">
      <div className="space-y-3.5">
        {STAGE_LABELS.map((s) => (
          <StepRow key={s.key} label={s.label} status={stepStatus[s.key]} />
        ))}
      </div>
      <p className="text-xs text-white/30 pt-3 border-t border-white/5">
        Estimated 3–5 minutes. Don&apos;t close this tab — but if you do, your
        render keeps going. Open it from My Videos when ready.
      </p>
    </div>
  );
}

function CompleteState({ renderId, videoUrl, onReset }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  function handleCopy() {
    if (!videoUrl || typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(videoUrl).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }

  const shareText = "Just directed this with Omnyra ✨";
  const twitterHref = videoUrl
    ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(videoUrl)}`
    : `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;

  return (
    <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-10 text-center space-y-7">
      <div className="flex justify-center">
        <div className="relative">
          <span className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping" />
          <span className="relative w-[72px] h-[72px] rounded-full bg-emerald-500/15 border border-emerald-400/40 flex items-center justify-center">
            <CheckCircle2 className="w-[60px] h-[60px] text-emerald-400" />
          </span>
        </div>
      </div>

      <h3 className="text-2xl font-bold text-white">Your video is ready.</h3>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <a
          href={videoUrl || "#"}
          download={`omnyra-${renderId}.mp4`}
          onClick={(e) => {
            if (!videoUrl) e.preventDefault();
          }}
          className={[
            "inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-white text-sm font-semibold transition-all",
            videoUrl
              ? "bg-emerald-600 hover:bg-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.35)]"
              : "bg-emerald-600/40 cursor-not-allowed",
          ].join(" ")}
        >
          <Download className="w-4 h-4" />
          Download MP4
        </a>
        <button
          onClick={() => onReset?.()}
          className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-white/15 text-white/70 hover:text-white hover:bg-white/5 text-sm font-medium transition-all"
        >
          Create Another
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <div className="pt-2 border-t border-white/5 mt-6">
        <p className="text-sm text-white/40 mb-3 flex items-center justify-center gap-2">
          <Share2 className="w-3.5 h-3.5" />
          Share your Omnyra creation
        </p>
        <div className="flex justify-center gap-2">
          <a
            href={twitterHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Twitter className="w-3.5 h-3.5" />
            Twitter
          </a>
          <button
            onClick={handleCopy}
            disabled={!videoUrl}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <LinkIcon className="w-3.5 h-3.5" />
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 *  Main — event-driven DraftStage
 *
 *  Props:
 *    renderId        : string         (REQUIRED)
 *    onApprove       : () => void
 *    onRegenerate    : () => void
 *    onBack          : () => void
 *    onReset         : () => void
 *
 *  All other state (script, status, scenes, video_url) is sourced from
 *  Supabase realtime via render_events + the renders row. No props for
 *  pipeline state — single source of truth is the database.
 * ───────────────────────────────────────────────────────────────── */

export function DraftStage({
  renderId,
  onApprove,
  onRegenerate,
  onBack,
  onReset,
}) {
  const supabaseRef = useRef(null);
  if (!supabaseRef.current) supabaseRef.current = createClient();
  const supabase = supabaseRef.current;

  const [render, setRender] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!renderId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      const [{ data: row }, { data: evts }] = await Promise.all([
        supabase
          .from("renders")
          .select("id, status, script, scenes, director_settings, brief, template, video_url, error_message")
          .eq("id", renderId)
          .maybeSingle(),
        supabase
          .from("render_events")
          .select("id, event_type, payload, created_at")
          .eq("render_id", renderId)
          .order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      setRender(row);
      setEvents(evts ?? []);
      setLoading(false);
    })();

    const channel = supabase
      .channel(`render_events:${renderId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "render_events",
          filter: `render_id=eq.${renderId}`,
        },
        (payload) => {
          setEvents((prev) => [...prev, payload.new]);
          // On any pipeline-affecting event, re-pull the renders row so the
          // download URL / status / script are fresh. Cheap; one row only.
          supabase
            .from("renders")
            .select(
              "id, status, script, scenes, director_settings, brief, template, video_url, error_message",
            )
            .eq("id", renderId)
            .maybeSingle()
            .then(({ data }) => {
              if (!cancelled && data) setRender(data);
            });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [renderId, supabase]);

  const phase = useMemo(() => derivePhase(events, render), [events, render]);
  const failureMessage = useMemo(() => deriveFailure(events, render), [events, render]);

  if (!renderId) {
    return (
      <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-10 text-center text-white/50">
        Missing render id. Start a new render from your dashboard.
      </div>
    );
  }

  if (loading) return <GeneratingState />;

  if (phase === "generating") return <GeneratingState />;
  if (phase === "rendering") return <RenderingState events={events} />;
  if (phase === "complete")
    return (
      <CompleteState
        renderId={renderId}
        videoUrl={render?.video_url}
        onReset={onReset}
      />
    );

  return (
    <DraftState
      render={render}
      failureMessage={failureMessage}
      onApprove={onApprove}
      onRegenerate={onRegenerate}
      onBack={onBack}
    />
  );
}

export default DraftStage;
