"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import type { ShotPacket, MotionMap } from "@/lib/types/shot";

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// ── Theme ─────────────────────────────────────────────────────────────────────

const C = {
  bg:     "#07070f",
  card:   "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.08)",
  text:   "#f5f3ff",
  sub:    "rgba(245,243,255,0.5)",
  dim:    "rgba(245,243,255,0.25)",
  violet: "#7c6fff",
  cyan:   "#22d3ee",
  green:  "#22c55e",
  amber:  "#f59e0b",
  red:    "#ef4444",
};

// ── Types ─────────────────────────────────────────────────────────────────────

type RenderStatus = "idle" | "queued" | "rendering" | "composing" | "completed" | "failed";

interface ShotRow extends ShotPacket {
  id: string;
  clip_url?: string;
  render_status?: "pending" | "rendering" | "completed" | "failed";
  render_error?: string;
  scene_image_url?: string | null;
}

interface PlanData {
  id: string;
  project_id: string | null;
  platform: string;
  status: string;
  motion_map: MotionMap;
  shots: ShotRow[];
  voiceover_url: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONTENT_ICON: Record<string, string> = {
  avatar:       "👤",
  broll:        "🎬",
  text_overlay: "📝",
  transition:   "✂️",
};

const ATTENTION_COLOR: Record<string, string> = {
  pattern_interrupt:  C.cyan,
  curiosity_spike:    C.violet,
  trust_grounding:    C.green,
  tension_escalation: C.amber,
  emotional_release:  C.green,
  desire_activation:  C.violet,
  urgency_trigger:    C.red,
  pacing_reset:       C.sub,
};

const ENERGY_COLOR = (v: number): string => {
  if (v >= 0.8) return C.red;
  if (v >= 0.6) return C.amber;
  if (v >= 0.4) return C.violet;
  return C.cyan;
};

const STATUS_COLOR: Record<RenderStatus, string> = {
  idle:      C.dim,
  queued:    C.amber,
  rendering: C.violet,
  composing: C.cyan,
  completed: C.green,
  failed:    C.red,
};

const STATUS_LABEL: Record<RenderStatus, string> = {
  idle:      "Ready to render",
  queued:    "Queued…",
  rendering: "Rendering shots…",
  composing: "Composing video…",
  completed: "Complete",
  failed:    "Failed",
};

// ── ShotCard — inline scene editing ──────────────────────────────────────────

interface ShotCardProps {
  shot: ShotRow;
  index: number;
  totalShots: number;
  isActive: boolean;
  isDone: boolean;
  isFailed: boolean;
  isRendering: boolean;
  isRetrying: boolean;
  onSceneImageSaved: (url: string | null) => void;
  onRetry: () => void;
}

function ShotCard({
  shot, index, totalShots,
  isActive, isDone, isFailed, isRendering, isRetrying,
  onSceneImageSaved, onRetry,
}: ShotCardProps) {
  const [expanded,        setExpanded]        = useState(false);
  const [editPrompt,      setEditPrompt]      = useState(shot.visual_prompt);
  const [images,          setImages]          = useState<string[]>([]);
  const [selectedImage,   setSelectedImage]   = useState<string | null>(shot.scene_image_url ?? null);
  const [generatingImgs,  setGeneratingImgs]  = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [imgError,        setImgError]        = useState("");

  async function generateImages() {
    setGeneratingImgs(true);
    setImgError("");
    setImages([]);
    try {
      const res  = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: editPrompt, style: "lifestyle", aspect_ratio: "9:16", num_images: 5, seed: Date.now() }),
      });
      const data = await res.json() as { images?: string[]; error?: string };
      if (!res.ok || !data.images?.length) throw new Error(data.error ?? "No images returned");
      setImages(data.images);
    } catch (err) {
      setImgError(err instanceof Error ? err.message : "Image generation failed");
    } finally {
      setGeneratingImgs(false);
    }
  }

  async function saveScene() {
    if (!selectedImage) return;
    setSaving(true);
    setImgError("");
    try {
      const res = await fetch(`/api/shots/${shot.shot_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene_image_url: selectedImage, visual_prompt: editPrompt }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? "Save failed");
      onSceneImageSaved(selectedImage);
      setExpanded(false);
    } catch (err) {
      setImgError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function revert() {
    setEditPrompt(shot.visual_prompt);
    setImages([]);
    setSelectedImage(shot.scene_image_url ?? null);
    setImgError("");
    setExpanded(false);
  }

  const hasScene = Boolean(shot.scene_image_url ?? selectedImage);

  return (
    <div
      id={`shot-card-${shot.shot_id}`}
      style={{
        borderBottom: index < totalShots - 1 ? `1px solid ${C.border}` : "none",
        background: isActive ? `${C.violet}10` : "transparent",
        transition: "background 0.2s",
      }}
    >
      {/* ── Top row (compact metadata) ─────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "44px 36px 52px 1fr 140px 90px 36px 28px",
          alignItems: "center",
          gap: 12,
          padding: "12px 24px",
        }}
      >
        {/* Shot number */}
        <div style={{ fontSize: 12, color: C.dim, fontVariantNumeric: "tabular-nums" }}>
          S{String(shot.shot_number).padStart(2, "0")}
        </div>

        {/* Content icon / scene image thumbnail */}
        <div
          style={{ fontSize: 16, textAlign: "center", position: "relative", cursor: "default" }}
          title={hasScene ? "Scene image set" : "No scene image"}
        >
          {hasScene ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shot.scene_image_url ?? selectedImage ?? ""}
              alt=""
              style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover", display: "block", margin: "0 auto" }}
            />
          ) : (
            <span style={{ opacity: shot.content_type === "avatar" ? 1 : 0.4 }}>
              {CONTENT_ICON[shot.content_type] ?? "🎞️"}
            </span>
          )}
        </div>

        {/* Duration */}
        <div style={{ fontSize: 12, color: C.sub, fontVariantNumeric: "tabular-nums" }}>
          {shot.duration_seconds.toFixed(1)}s
        </div>

        {/* Attention + rationale */}
        <div>
          <span style={{ fontSize: 11, fontWeight: 600, color: ATTENTION_COLOR[shot.attention_function] ?? C.violet, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {shot.attention_function.replace(/_/g, " ")}
          </span>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {shot.purpose_rationale}
          </div>
        </div>

        {/* Narration preview */}
        <div style={{ fontSize: 11, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {((shot as ShotRow & { narration_text?: string }).narration_text ?? editPrompt).slice(0, 60)}
        </div>

        {/* Render badge */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: `${C.violet}18`, color: C.violet, letterSpacing: "0.04em" }}>
            {shot.fal_model?.split("/").pop()?.toUpperCase() ?? "FAL"}
          </span>
        </div>

        {/* Edit scene button */}
        {shot.content_type !== "avatar" && shot.content_type !== "text_overlay" && (
          <button
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Collapse" : "Edit scene image"}
            style={{ background: "none", border: `1px solid ${expanded ? C.violet : C.border}`, borderRadius: 4, color: expanded ? C.violet : C.dim, fontSize: 10, fontWeight: 700, padding: "3px 6px", cursor: "pointer", letterSpacing: "0.04em", whiteSpace: "nowrap" }}
          >
            {expanded ? "CLOSE" : hasScene ? "EDIT" : "ADD"}
          </button>
        )}

        {/* Status dot / per-shot retry */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
          {isFailed && !isRetrying ? (
            <button
              onClick={(e) => { e.stopPropagation(); onRetry(); }}
              title="Retry this shot"
              style={{ background: `${C.red}20`, border: `1px solid ${C.red}50`, color: C.red, borderRadius: 4, fontSize: 9, fontWeight: 700, padding: "2px 5px", cursor: "pointer", letterSpacing: "0.04em" }}
            >
              RETRY
            </button>
          ) : isRetrying ? (
            <Spinner />
          ) : (isRendering || isDone || isFailed) ? (
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: isDone ? C.green : isActive ? C.violet : C.dim, boxShadow: isActive ? `0 0 6px ${C.violet}` : "none" }} />
          ) : null}
        </div>
      </div>

      {/* ── Expanded panel — scene image editor ───────────────────────── */}
      {expanded && (
        <div style={{ padding: "0 24px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Prompt editor */}
          <div>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Scene Prompt</div>
            <textarea
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                color: C.text,
                fontSize: 13,
                padding: "10px 12px",
                resize: "vertical",
                fontFamily: "inherit",
                lineHeight: 1.5,
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Generate button */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={generateImages}
              disabled={generatingImgs || !editPrompt.trim()}
              style={{
                background: generatingImgs ? "rgba(124,111,255,0.12)" : C.violet,
                color: generatingImgs ? C.violet : "#fff",
                border: generatingImgs ? `1px solid ${C.violet}40` : "none",
                borderRadius: 7,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                cursor: generatingImgs ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {generatingImgs && <Spinner />}
              {generatingImgs ? "Generating…" : images.length > 0 ? "Regenerate 5 New" : "Generate 5 Images"}
            </button>

            {images.length > 0 && (
              <span style={{ fontSize: 12, color: C.dim }}>
                {selectedImage && images.includes(selectedImage) ? "1 selected" : "Pick one"}
              </span>
            )}
          </div>

          {/* Error */}
          {imgError && (
            <div style={{ fontSize: 12, color: C.red, background: `${C.red}18`, borderRadius: 6, padding: "6px 10px" }}>
              {imgError}
            </div>
          )}

          {/* Image picker grid */}
          {images.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
              {images.map((url) => (
                <button
                  key={url}
                  onClick={() => setSelectedImage(url)}
                  style={{
                    padding: 0,
                    border: `2px solid ${selectedImage === url ? C.violet : "transparent"}`,
                    borderRadius: 6,
                    cursor: "pointer",
                    background: "none",
                    overflow: "hidden",
                    aspectRatio: "9/16",
                    position: "relative",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  {selectedImage === url && (
                    <div style={{ position: "absolute", inset: 0, background: `${C.violet}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                      ✓
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Action row */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={saveScene}
              disabled={saving || !selectedImage}
              style={{
                background: saving || !selectedImage ? "rgba(34,197,94,0.1)" : C.green,
                color: saving || !selectedImage ? C.green : "#000",
                border: saving || !selectedImage ? `1px solid ${C.green}40` : "none",
                borderRadius: 7,
                padding: "8px 18px",
                fontSize: 13,
                fontWeight: 600,
                cursor: saving || !selectedImage ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {saving && <Spinner />}
              {saving ? "Saving…" : "Save Scene Image"}
            </button>

            <button
              onClick={revert}
              style={{ background: "none", border: `1px solid ${C.border}`, color: C.sub, borderRadius: 7, padding: "8px 14px", fontSize: 13, cursor: "pointer" }}
            >
              Revert
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DirectorModePage() {
  const { planId } = useParams<{ planId: string }>();
  const router     = useRouter();

  const [plan,         setPlan]         = useState<PlanData | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [renderStatus,    setRenderStatus]    = useState<RenderStatus>("idle");
  const [jobId,           setJobId]           = useState<string | null>(null);
  const [progress,        setProgress]        = useState(0);
  const [shotStatuses,    setShotStatuses]    = useState<Record<string, string>>({});
  const [videoUrl,        setVideoUrl]        = useState<string | null>(null);
  const [composeStatus,   setComposeStatus]   = useState<"idle" | "composing" | "done" | "failed">("idle");
  const [composedVideoUrl, setComposedVideoUrl] = useState<string | null>(null);
  const [session,         setSession]         = useState<{ access_token: string } | null>(null);

  // Voiceover
  const [voiceoverUrl,         setVoiceoverUrl]         = useState<string | null>(null);
  const [generatingVoiceover,  setGeneratingVoiceover]  = useState(false);
  const [voiceoverError,       setVoiceoverError]       = useState("");

  // Per-shot generation tracking
  const [generatingAll,    setGeneratingAll]    = useState(false);
  const [shotGenProgress,  setShotGenProgress]  = useState({ done: 0, total: 0 });
  const [currentShotLabel, setCurrentShotLabel] = useState("");
  const [retryingShotIds,  setRetryingShotIds]  = useState<Set<string>>(new Set());
  const [elapsedSeconds,   setElapsedSeconds]   = useState(0);

  const pollRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Async fal polling state
  const pendingFalIdsRef  = useRef<Array<{ dbId: string; shotId: string }>>([]);
  const pollRunningRef    = useRef(false);
  const doneCountRef      = useRef(0);
  const totalPendingRef   = useRef(0);
  const startTimeRef      = useRef(0);
  const elapsedTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    getSupabase().auth.getSession().then(({ data }) => {
      setSession(data.session);
    });
  }, []);

  // ── Load plan ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!planId) return;
    loadPlan();
  }, [planId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPlan() {
    setLoading(true);
    setError("");
    const db = getSupabase();

    const [planRes, shotsRes] = await Promise.all([
      db
        .from("shot_plans")
        .select("id, project_id, platform, status, motion_map, voiceover_url")
        .eq("id", planId)
        .single(),
      db
        .from("shots")
        .select("*")
        .eq("shot_plan_id", planId)
        .order("shot_number", { ascending: true }),
    ]);

    if (planRes.error || !planRes.data) {
      setError(planRes.error?.message ?? "Plan not found");
      setLoading(false);
      return;
    }

    const loadedPlan = {
      ...planRes.data,
      project_id: planRes.data.project_id ?? null,
      voiceover_url: (planRes.data.voiceover_url as string | null) ?? null,
      shots: shotsRes.data ?? [],
    };
    setPlan(loadedPlan);
    if (loadedPlan.voiceover_url) setVoiceoverUrl(loadedPlan.voiceover_url);
    setLoading(false);
  }

  // ── Generate master voiceover ─────────────────────────────────────────────────
  async function handleGenerateVoiceover() {
    if (!plan || generatingVoiceover) return;
    setGeneratingVoiceover(true);
    setVoiceoverError("");

    try {
      const res = await fetch("/api/generate-voiceover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });
      const data = await res.json() as { success?: boolean; audio_url?: string; error?: string; duration_seconds?: number };
      if (!res.ok || !data.success || !data.audio_url) {
        throw new Error(data.error ?? "Voiceover generation failed");
      }
      setVoiceoverUrl(data.audio_url);
      setPlan(prev => prev ? { ...prev, voiceover_url: data.audio_url! } : prev);
    } catch (err) {
      setVoiceoverError(err instanceof Error ? err.message : "Voiceover generation failed");
    } finally {
      setGeneratingVoiceover(false);
    }
  }

  // ── Batch poll loop — runs until pendingFalIdsRef is empty ──────────────────
  function startBatchPoll() {
    if (pollRunningRef.current) return; // already polling
    pollRunningRef.current = true;

    const poll = async () => {
      const ids = pendingFalIdsRef.current;

      if (ids.length === 0) {
        pollRunningRef.current = false;
        if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
        setCurrentShotLabel("");
        setGeneratingAll(false);
        setRenderStatus(prev => prev === "rendering" ? (doneCountRef.current >= totalPendingRef.current ? "completed" : "failed") : prev);
        return;
      }

      try {
        const res = await fetch("/api/generate-shot/status-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shotDbIds: ids.map(x => x.dbId) }),
        });
        const data = await res.json() as {
          shots?: Array<{
            id: string; shot_id: string; shot_number: number;
            status: string; clip_url?: string; error?: string;
          }>;
        };

        const remaining: typeof ids = [];

        for (const item of ids) {
          const shotData = data.shots?.find(s => s.id === item.dbId);
          if (!shotData) { remaining.push(item); continue; }

          if (shotData.status === "completed") {
            doneCountRef.current++;
            setShotStatuses(prev => ({ ...prev, [item.shotId]: "completed" }));
            if (shotData.clip_url) {
              setPlan(prev =>
                prev ? {
                  ...prev,
                  shots: prev.shots.map(s =>
                    s.shot_id === item.shotId
                      ? { ...s, clip_url: shotData.clip_url!, render_status: "completed" }
                      : s,
                  ),
                } : prev,
              );
            }
          } else if (shotData.status === "failed") {
            setShotStatuses(prev => ({ ...prev, [item.shotId]: "failed" }));
            if (shotData.error) {
              setError(prev => prev || `Shot ${shotData.shot_number} failed: ${shotData.error}`);
            }
          } else {
            remaining.push(item);
          }
        }

        pendingFalIdsRef.current = remaining;
        setShotGenProgress(prev => ({ ...prev, done: doneCountRef.current }));
        if (totalPendingRef.current > 0) {
          setProgress(Math.round((doneCountRef.current / totalPendingRef.current) * 100));
        }

        if (remaining.length > 0) {
          const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
          setCurrentShotLabel(`${remaining.length} shot${remaining.length !== 1 ? "s" : ""} processing… ${elapsed}s elapsed`);
          pollRef.current = setTimeout(poll, 5000);
        } else {
          poll(); // one more pass to trigger the empty-check above
        }
      } catch {
        // Network error — back off and retry
        pollRef.current = setTimeout(poll, 8000);
      }
    };

    poll();
  }

  // ── Per-shot generation — Phase 1: submit all, Phase 2: batch poll ───────────
  async function handleGenerateShots() {
    if (!plan) return;
    setError("");
    setGeneratingAll(true);
    setRenderStatus("rendering");

    const pending = plan.shots.filter(s => !s.clip_url || s.render_status !== "completed");
    if (pending.length === 0) {
      setGeneratingAll(false);
      setRenderStatus("completed");
      return;
    }

    // Reset counters
    doneCountRef.current = 0;
    totalPendingRef.current = pending.length;
    pendingFalIdsRef.current = [];
    setShotGenProgress({ done: 0, total: pending.length });
    setProgress(0);
    setElapsedSeconds(0);
    startTimeRef.current = Date.now();
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds(Math.round((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    setCurrentShotLabel(`Submitting ${pending.length} shot${pending.length !== 1 ? "s" : ""}…`);

    // Phase 1: fire off all submissions (fast — fal queue returns immediately)
    for (const shot of pending) {
      setShotStatuses(prev => ({ ...prev, [shot.shot_id]: "queued" }));

      try {
        const res = await fetch("/api/generate-shot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shotId: shot.shot_id }),
        });
        const data = await res.json() as {
          success?: boolean;
          status?: string;
          clip_url?: string;
          fal_request_id?: string;
          shot_db_id?: string;
          shot_number?: number;
          error?: string;
        };

        if (data.status === "queued" && data.shot_db_id) {
          // Async fal path — will be polled
          pendingFalIdsRef.current = [
            ...pendingFalIdsRef.current,
            { dbId: data.shot_db_id, shotId: shot.shot_id },
          ];
        } else if (data.success && data.clip_url) {
          // Sync completion (HeyGen or text_overlay)
          doneCountRef.current++;
          setShotStatuses(prev => ({ ...prev, [shot.shot_id]: "completed" }));
          setPlan(prev =>
            prev ? {
              ...prev,
              shots: prev.shots.map(s =>
                s.shot_id === shot.shot_id
                  ? { ...s, clip_url: data.clip_url!, render_status: "completed" }
                  : s,
              ),
            } : prev,
          );
          setShotGenProgress(prev => ({ ...prev, done: doneCountRef.current }));
          setProgress(Math.round((doneCountRef.current / pending.length) * 100));
        } else {
          setShotStatuses(prev => ({ ...prev, [shot.shot_id]: "failed" }));
          if (data.error) setError(prev => prev || `Shot ${shot.shot_number ?? ""} failed: ${data.error}`);
        }
      } catch (err) {
        setShotStatuses(prev => ({ ...prev, [shot.shot_id]: "failed" }));
        setError(prev => prev || `Shot ${shot.shot_number} failed: ${err instanceof Error ? err.message : "Network error"}`);
      }
    }

    // Phase 2: poll fal queue until all async shots finish
    if (pendingFalIdsRef.current.length === 0) {
      if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
      setCurrentShotLabel("");
      setGeneratingAll(false);
      setRenderStatus(doneCountRef.current === pending.length ? "completed" : "failed");
      return;
    }

    const queuedCount = pendingFalIdsRef.current.length;
    setCurrentShotLabel(`${queuedCount} shot${queuedCount !== 1 ? "s" : ""} processing on fal.ai…`);
    startBatchPoll();
  }

  // ── Per-shot retry ─────────────────────────────────────────────────────────
  async function retryShot(shot: ShotRow) {
    setRetryingShotIds(prev => new Set([...prev, shot.shot_id]));
    setShotStatuses(prev => ({ ...prev, [shot.shot_id]: "queued" }));

    try {
      const res = await fetch("/api/generate-shot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shotId: shot.shot_id }),
      });
      const data = await res.json() as {
        success?: boolean;
        status?: string;
        clip_url?: string;
        shot_db_id?: string;
        error?: string;
      };

      if (data.status === "queued" && data.shot_db_id) {
        // Add to polling pool and start poll if not running
        pendingFalIdsRef.current = [
          ...pendingFalIdsRef.current,
          { dbId: data.shot_db_id, shotId: shot.shot_id },
        ];
        if (!startTimeRef.current) startTimeRef.current = Date.now();
        startBatchPoll();
      } else if (data.success && data.clip_url) {
        setShotStatuses(prev => ({ ...prev, [shot.shot_id]: "completed" }));
        setPlan(prev =>
          prev ? {
            ...prev,
            shots: prev.shots.map(s =>
              s.shot_id === shot.shot_id
                ? { ...s, clip_url: data.clip_url!, render_status: "completed" }
                : s,
            ),
          } : prev,
        );
      } else {
        setShotStatuses(prev => ({ ...prev, [shot.shot_id]: "failed" }));
      }
    } catch {
      setShotStatuses(prev => ({ ...prev, [shot.shot_id]: "failed" }));
    } finally {
      setRetryingShotIds(prev => {
        const next = new Set(prev);
        next.delete(shot.shot_id);
        return next;
      });
    }
  }

  // ── Compose (FFmpeg microservice) ────────────────────────────────────────
  async function handleCompose() {
    if (!plan) return;
    setComposeStatus("composing");
    setError("");

    try {
      const res = await fetch("/api/compose-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId:    plan.project_id ?? plan.id,
          shotPlanId:   planId,
          // Pass voiceoverUrl from local state — avoids relying on DB lookup
          // which can fail silently if the prior write had an RLS/network issue
          ...(voiceoverUrl ? { voiceoverUrl } : {}),
        }),
      });

      const data = await res.json() as {
        success?: boolean; video_url?: string; error?: string;
        warning?: string; shots_used?: number; total_shots?: number; has_audio?: boolean;
      };
      if (!res.ok || !data.success) throw new Error(data.error ?? "Compose failed");

      setComposedVideoUrl(data.video_url ?? null);
      setComposeStatus("done");

      if (data.warning) setError(data.warning); // non-fatal — show as info
    } catch (err) {
      setError(err instanceof Error ? err.message : "Compose failed");
      setComposeStatus("failed");
    }
  }

  // ── Polling ───────────────────────────────────────────────────────────────
  const startPolling = useCallback((jId: string) => {
    const poll = async () => {
      try {
        const res  = await fetch(`/api/render-status/${jId}`);
        const data = await res.json();

        setRenderStatus(data.status as RenderStatus);
        setProgress(data.progress ?? 0);

        if (data.shots) {
          const map: Record<string, string> = {};
          for (const s of data.shots) map[s.shot_id] = s.render_status ?? "pending";
          setShotStatuses(map);
        }

        if (data.status === "completed") {
          setVideoUrl(data.video_url);
          return; // stop polling
        }
        if (data.status === "failed") {
          setError(data.error_message ?? "Render failed");
          return;
        }

        pollRef.current = setTimeout(poll, 5000);
      } catch {
        pollRef.current = setTimeout(poll, 8000);
      }
    };

    poll();
  }, []);

  useEffect(() => () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
  }, []);

  // ── Render UI ─────────────────────────────────────────────────────────────

  if (loading) return <LoadingScreen />;
  if (error && !plan) return <ErrorScreen message={error} onBack={() => router.back()} />;
  if (!plan) return null;

  const { shots, motion_map: mm } = plan;
  const isRendering = generatingAll || ["queued", "rendering", "composing"].includes(renderStatus);
  // allShotsReady uses plan.shots (kept in sync by handleGenerateShots via setPlan)
  const allShotsReady = shots.length > 0 && shots.every(s => s.clip_url && s.render_status === "completed");
  const canStartGeneration = !generatingAll && renderStatus !== "completed" && !allShotsReady;
  const isComposing   = composeStatus === "composing";
  const finalVideoUrl = composedVideoUrl ?? videoUrl;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "var(--font-sans, system-ui)" }}>
      {/* Header */}
      <div style={{ padding: "24px 32px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            onClick={() => router.back()}
            style={{ background: "none", border: "none", color: C.sub, cursor: "pointer", fontSize: 14, padding: 0 }}
          >
            ← Back
          </button>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>Director Mode</div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
              {mm.shot_count} shots · {Math.round(mm.total_duration)}s · {plan.platform}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Per-shot progress label */}
          {generatingAll && currentShotLabel && (
            <div style={{ fontSize: 12, color: C.sub, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentShotLabel}
            </div>
          )}

          {/* Status badge */}
          <div style={{ fontSize: 12, color: STATUS_COLOR[renderStatus], padding: "4px 10px", border: `1px solid ${STATUS_COLOR[renderStatus]}40`, borderRadius: 20, flexShrink: 0 }}>
            {generatingAll
              ? `${shotGenProgress.done}/${shotGenProgress.total} shots`
              : STATUS_LABEL[renderStatus]}
          </div>

          {/* Generate shots button — shown when shots still need generating */}
          {canStartGeneration && (
            <button
              onClick={handleGenerateShots}
              style={{ background: C.violet, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
            >
              Generate Shots
            </button>
          )}

          {/* Resume after partial failure */}
          {!generatingAll && renderStatus === "failed" && !allShotsReady && (
            <button
              onClick={handleGenerateShots}
              style={{ background: C.amber, color: "#000", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
            >
              Retry Failed Shots
            </button>
          )}

          {/* Compose button — shown when all shots are ready */}
          {(allShotsReady || renderStatus === "completed") && composeStatus !== "done" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
              {!voiceoverUrl && !isComposing && (
                <div style={{ fontSize: 10, color: C.amber, fontWeight: 600, letterSpacing: "0.04em" }}>
                  NO VOICEOVER — will compose without audio
                </div>
              )}
              <button
                onClick={handleCompose}
                disabled={isComposing}
                style={{
                  background: isComposing ? "rgba(34,211,238,0.15)" : C.cyan,
                  color: isComposing ? C.cyan : "#000",
                  border: isComposing ? `1px solid ${C.cyan}40` : "none",
                  borderRadius: 8,
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: isComposing ? "default" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "all 0.2s",
                }}
              >
                {isComposing && <Spinner />}
                {isComposing ? "Assembling…" : "Compose Video ✦"}
              </button>
            </div>
          )}

          {/* Spinner while generating */}
          {generatingAll && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: C.sub }}>
              <Spinner />
              {progress}%
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "32px", maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 32 }}>

        {/* Error / warning banner */}
        {error && (
          <div style={{
            background: composeStatus === "done" ? `${C.amber}15` : `${C.red}18`,
            border: `1px solid ${composeStatus === "done" ? C.amber : C.red}40`,
            borderRadius: 8,
            padding: "12px 16px",
            color: composeStatus === "done" ? C.amber : C.red,
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span>{error}</span>
            <button onClick={() => setError("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16, padding: "0 4px", opacity: 0.6 }}>×</button>
          </div>
        )}

        {/* Final video */}
        {finalVideoUrl && (
          <div style={{ background: C.card, border: `1px solid ${C.green}40`, borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 13, color: C.green, fontWeight: 600, marginBottom: 16 }}>
              ✓ Video Ready{composedVideoUrl ? " — assembled with FFmpeg" : ""}
            </div>
            <video
              src={finalVideoUrl}
              controls
              style={{ width: "100%", maxWidth: 360, borderRadius: 8, display: "block", margin: "0 auto" }}
            />
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <a
                href={finalVideoUrl}
                download="omnyra-video.mp4"
                style={{ color: C.cyan, fontSize: 13, textDecoration: "none" }}
              >
                Download MP4
              </a>
            </div>
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { label: "Total duration",  value: `${Math.round(mm.total_duration)}s` },
            { label: "Avatar time",     value: `${Math.round(mm.avatar_seconds)}s` },
            { label: "B-roll time",     value: `${Math.round(mm.broll_seconds)}s` },
            { label: "Pacing rhythm",   value: mm.pacing_rhythm?.split("→")[0]?.trim() ?? "—" },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 20px" }}>
              <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Energy curve */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 24px" }}>
          <div style={{ fontSize: 12, color: C.sub, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Energy Arc</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 60 }}>
            {shots.map((s) => (
              <div
                key={s.shot_id}
                title={`${s.shot_id}: ${s.attention_function} (${s.motion_intensity})`}
                style={{
                  flex: s.duration_seconds,
                  height: `${Math.max(10, s.motion_intensity * 100)}%`,
                  background: ENERGY_COLOR(s.motion_intensity),
                  borderRadius: "2px 2px 0 0",
                  opacity: 0.85,
                  transition: "opacity 0.15s",
                  cursor: "default",
                  minWidth: 4,
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: C.dim }}>
            <span>0s</span>
            <span>{Math.round(mm.total_duration / 2)}s</span>
            <span>{Math.round(mm.total_duration)}s</span>
          </div>
        </div>

        {/* Master Voiceover */}
        <VoiceoverPanel
          shots={shots}
          planId={planId}
          voiceoverUrl={voiceoverUrl}
          generating={generatingVoiceover}
          error={voiceoverError}
          onGenerate={handleGenerateVoiceover}
          onDismissError={() => setVoiceoverError("")}
        />

        {/* Storyboard strip */}
        <StoryboardStrip shots={shots} />

        {/* Shot list */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "16px 24px", borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.sub, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Shot List
          </div>

          {shots.map((shot, i) => {
            const shotRenderStatus = shotStatuses[shot.shot_id] ?? shot.render_status ?? "pending";
            const isActive = isRendering && shotRenderStatus === "rendering";
            const isDone   = shotRenderStatus === "completed";
            const isFailed = shotRenderStatus === "failed";

            return (
              <ShotCard
                key={shot.shot_id}
                shot={shot}
                index={i}
                totalShots={shots.length}
                isActive={isActive}
                isDone={isDone}
                isFailed={isFailed}
                isRendering={isRendering}
                isRetrying={retryingShotIds.has(shot.shot_id)}
                onRetry={() => retryShot(shot)}
                onSceneImageSaved={(url) => {
                  setPlan((prev) =>
                    prev
                      ? {
                          ...prev,
                          shots: prev.shots.map((s) =>
                            s.shot_id === shot.shot_id ? { ...s, scene_image_url: url } : s,
                          ),
                        }
                      : prev,
                  );
                }}
              />
            );
          })}
        </div>

        {/* Progress bar — per-shot generation */}
        {generatingAll && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 13 }}>
              <span style={{ color: C.sub }}>
                {currentShotLabel || `Generating shots… (${shotGenProgress.done}/${shotGenProgress.total})`}
              </span>
              <span style={{ color: C.dim, fontSize: 11 }}>{progress}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  background: `linear-gradient(90deg, ${C.violet}, ${C.cyan})`,
                  borderRadius: 2,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: C.dim }}>
              All shots submitted in parallel — fal.ai processes them concurrently. Typically 45–90s total.
              {elapsedSeconds > 0 && <span style={{ color: C.sub, marginLeft: 8 }}>{elapsedSeconds}s elapsed</span>}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── VoiceoverPanel ────────────────────────────────────────────────────────────

interface VoiceoverPanelProps {
  shots: ShotRow[];
  planId: string;
  voiceoverUrl: string | null;
  generating: boolean;
  error: string;
  onGenerate: () => void;
  onDismissError: () => void;
}

function VoiceoverPanel({ shots, planId, voiceoverUrl, generating, error, onGenerate, onDismissError }: VoiceoverPanelProps) {
  const [downloadingSubs, setDownloadingSubs] = useState(false);
  async function downloadSubtitles(format: "srt" | "vtt") {
    setDownloadingSubs(true);
    try {
      const res = await fetch("/api/generate-subtitles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json() as { success?: boolean; srt?: string; vtt?: string; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? "Subtitle generation failed");
      const content = format === "srt" ? data.srt! : data.vtt!;
      const blob = new Blob([content], { type: format === "srt" ? "text/plain" : "text/vtt" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `subtitles.${format}`; a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent — subtitles are optional */ }
    finally { setDownloadingSubs(false); }
  }

  const narrationLines = shots
    .map(s => ((s as ShotRow & { narration_text?: string }).narration_text ?? "").trim())
    .filter(Boolean);
  const fullNarration = narrationLines.join(" ");
  const wordCount = fullNarration ? fullNarration.split(/\s+/).length : 0;
  const estDuration = wordCount ? Math.round(wordCount / 2.4) : 0;
  const hasNarration = wordCount > 0;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: C.sub, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Master Voiceover
          </div>
          {hasNarration && (
            <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>
              {wordCount} words · ~{estDuration}s narration across {shots.length} shots
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {voiceoverUrl && (
            <span style={{ fontSize: 10, fontWeight: 700, color: C.green, padding: "2px 8px", border: `1px solid ${C.green}40`, borderRadius: 20 }}>
              READY
            </span>
          )}
          <button
            onClick={onGenerate}
            disabled={generating || !hasNarration}
            style={{
              background: generating ? `${C.violet}18` : voiceoverUrl ? "rgba(255,255,255,0.06)" : C.violet,
              color: generating ? C.violet : voiceoverUrl ? C.sub : "#fff",
              border: generating ? `1px solid ${C.violet}40` : voiceoverUrl ? `1px solid ${C.border}` : "none",
              borderRadius: 7,
              padding: "7px 14px",
              fontSize: 12,
              fontWeight: 600,
              cursor: generating || !hasNarration ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "inherit",
            }}
          >
            {generating && <Spinner />}
            {generating ? "Generating…" : voiceoverUrl ? "Regenerate" : "Generate Voiceover"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize: 12, color: C.red, background: `${C.red}18`, borderRadius: 6, padding: "8px 12px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{error}</span>
          <button onClick={onDismissError} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 14, padding: "0 4px" }}>×</button>
        </div>
      )}

      {/* Narration preview */}
      {hasNarration && !voiceoverUrl && (
        <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.65, background: "rgba(255,255,255,0.025)", borderRadius: 8, padding: "12px 14px", maxHeight: 80, overflow: "hidden", position: "relative" }}>
          {fullNarration.slice(0, 200)}{fullNarration.length > 200 ? "…" : ""}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 24, background: "linear-gradient(transparent, rgba(7,7,15,0.9))" }} />
        </div>
      )}

      {/* Audio player + subtitle downloads */}
      {voiceoverUrl && (
        <div>
          <audio
            controls
            src={voiceoverUrl}
            style={{ width: "100%", height: 36, marginTop: 4, filter: "invert(0.85) hue-rotate(230deg)" }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <span style={{ fontSize: 11, color: C.dim, alignSelf: "center" }}>Subtitles:</span>
            {(["srt", "vtt"] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => downloadSubtitles(fmt)}
                disabled={downloadingSubs}
                style={{
                  background: "none", border: `1px solid ${C.border}`, color: C.sub,
                  borderRadius: 5, padding: "3px 10px", fontSize: 11, fontWeight: 600,
                  cursor: downloadingSubs ? "default" : "pointer", fontFamily: "inherit",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                }}
              >
                .{fmt}
              </button>
            ))}
          </div>
        </div>
      )}

      {!hasNarration && (
        <div style={{ fontSize: 12, color: C.dim, background: `${C.amber}10`, border: `1px solid ${C.amber}30`, borderRadius: 8, padding: "10px 14px" }}>
          No narration text found in this shot plan. Re-run shot plan generation to add per-shot narration.
        </div>
      )}
    </div>
  );
}

// ── StoryboardStrip ───────────────────────────────────────────────────────────

function StoryboardStrip({ shots }: { shots: ShotRow[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const hasAny = shots.some(s => s.scene_image_url);

  function scrollToShot(shotId: string) {
    document.getElementById(`shot-card-${shotId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 24px" }}>
      <div style={{ fontSize: 12, color: C.sub, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
        Scene Storyboard
      </div>

      {!hasAny ? (
        <div style={{ border: `1px dashed ${C.border}`, borderRadius: 8, padding: "28px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 8 }}>
            No scene images yet — click <strong style={{ color: C.sub }}>ADD</strong> on any shot card to generate visuals.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
          {shots.map((s) => {
            const isHovered = hovered === s.shot_id;
            const accentColor = ATTENTION_COLOR[s.attention_function] ?? C.sub;
            return (
              <div
                key={s.shot_id}
                title={`Shot ${s.shot_number}: ${s.attention_function.replace(/_/g, " ")}`}
                onClick={() => scrollToShot(s.shot_id)}
                onMouseEnter={() => setHovered(s.shot_id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  flexShrink: 0,
                  position: "relative",
                  width: 80,
                  borderRadius: 8,
                  overflow: "hidden",
                  border: `1px solid ${s.scene_image_url ? accentColor + "60" : C.border}`,
                  cursor: "pointer",
                  transform: isHovered ? "scale(1.05)" : "scale(1)",
                  boxShadow: isHovered ? `0 4px 18px rgba(0,0,0,0.5)` : "none",
                  transition: "transform 0.15s ease, box-shadow 0.15s ease",
                }}
              >
                {s.scene_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.scene_image_url}
                    alt=""
                    loading="lazy"
                    style={{ width: 80, height: 142, objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <div style={{ width: 80, height: 142, background: "rgba(255,255,255,0.03)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, opacity: 0.3 }}>
                    {CONTENT_ICON[s.content_type] ?? "🎞️"}
                  </div>
                )}
                {/* Shot number badge */}
                <div style={{ position: "absolute", top: 4, left: 4 }}>
                  <span style={{ fontSize: 8, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,0.65)", borderRadius: 4, padding: "1px 4px" }}>
                    {`S${String(s.shot_number).padStart(2, "0")}`}
                  </span>
                </div>
                {/* Attention function badge */}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(0,0,0,0.88))", padding: "14px 4px 4px" }}>
                  <span style={{ fontSize: 7, fontWeight: 700, color: accentColor, display: "block", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.04em", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                    {s.attention_function.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sub-components — LoadingScreen, ErrorScreen, Spinner ──────────────────────

function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", background: "#07070f", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "rgba(245,243,255,0.4)", fontSize: 14 }}>Loading shot plan…</div>
    </div>
  );
}

function ErrorScreen({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div style={{ minHeight: "100vh", background: "#07070f", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div style={{ color: "#ef4444", fontSize: 14 }}>{message}</div>
      <button onClick={onBack} style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(245,243,255,0.6)", borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontSize: 13 }}>
        Go back
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: 14, height: 14,
        border: "2px solid rgba(255,255,255,0.15)",
        borderTopColor: "#7c6fff",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }}
    />
  );
}

