"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AnimatedBackground from "@/components/AnimatedBackground";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VideoItem {
  id: string;
  source: "render" | "cinematic_job" | "avatar_job";
  status: string;
  video_url?: string | null;
  thumbnail_url?: string | null;
  template?: string | null;
  script?: string | null;
  error?: string | null;
  progress?: number | null;
  created_at: string;
  completed_at?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: "⏳ Queued…",
    running: "🎬 Generating…",
    generating_clips: "🎬 Generating scenes…",
    generating_audio: "🎵 Adding voiceover…",
    composing: "✨ Composing…",
    awaiting_hedra: "🤖 Avatar rendering…",
    finalizing: "✨ Finalizing…",
    failed: "❌ Failed",
  };
  return labels[status] ?? "⏳ Processing…";
}

function getProgressPercent(status: string, progress?: number | null): number {
  if (typeof progress === "number" && progress > 0) return progress;
  const pct: Record<string, number> = {
    queued: 5,
    running: 20,
    generating_clips: 40,
    generating_audio: 70,
    composing: 80,
    awaiting_hedra: 60,
    finalizing: 90,
    complete: 100,
    completed: 100,
  };
  return pct[status] ?? 10;
}

function getETA(createdAt: string, status: string): string {
  const elapsed = (Date.now() - new Date(createdAt).getTime()) / 1000;
  const budget = status === "awaiting_hedra" ? 300 : 180;
  const remaining = Math.max(0, budget - elapsed);
  if (remaining < 15) return "Almost ready…";
  return `~${Math.ceil(remaining / 60)} min remaining`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const ACTIVE_STATUSES = new Set(["queued", "running", "generating_clips", "generating_audio", "composing", "awaiting_hedra", "finalizing"]);

// ─── Video Modal ──────────────────────────────────────────────────────────────

function VideoModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 99999,
        background: "rgba(0,0,0,0.92)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{ position: "relative", maxWidth: 400, width: "90vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        <video
          src={url}
          controls
          autoPlay
          playsInline
          style={{ width: "100%", borderRadius: 16, aspectRatio: "9/16", background: "#000", display: "block" }}
        />
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: -14, right: -14,
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: "50%", width: 32, height: 32,
            color: "white", cursor: "pointer", fontSize: 18,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >×</button>
      </div>
    </div>
  );
}

// ─── Video Card ───────────────────────────────────────────────────────────────

function VideoCard({
  video,
  onPlay,
  onDelete,
}: {
  video: VideoItem;
  onPlay: (url: string) => void;
  onDelete: (id: string, source: string) => void;
}) {
  const isComplete = video.status === "complete" || video.status === "completed";
  const isFailed = video.status === "failed" || video.status === "error";
  const isActive = ACTIVE_STATUSES.has(video.status);
  const pct = getProgressPercent(video.status, video.progress);
  const isAvatar = video.template === "avatar" || video.source === "avatar_job";

  if (isActive) {
    return (
      <div style={{
        background: "rgba(255,255,255,0.03)",
        borderRadius: 16,
        border: "1px solid rgba(201,168,76,0.25)",
        padding: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: isAvatar ? "rgba(192,132,252,0.15)" : "rgba(201,168,76,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, flexShrink: 0,
          }}>
            {isAvatar ? "👤" : "🎬"}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "white", fontWeight: 700, fontSize: 14 }}>
              {isAvatar ? "Avatar Video" : "Cinematic Video"}
            </div>
            <div style={{ color: "#C9A84C", fontSize: 12, marginTop: 2 }}>
              {getStatusLabel(video.status)}
            </div>
          </div>
          <div style={{
            width: 28, height: 28,
            border: "2.5px solid rgba(201,168,76,0.3)",
            borderTop: "2.5px solid #C9A84C",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            flexShrink: 0,
          }} />
        </div>
        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 99, height: 4, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 99,
            background: "linear-gradient(90deg, #C9A84C, #C084FC)",
            width: `${pct}%`,
            transition: "width 0.5s ease",
          }} />
        </div>
        <div style={{ color: "#666", fontSize: 12, marginTop: 8, textAlign: "right" }}>
          {getETA(video.created_at, video.status)}
        </div>
      </div>
    );
  }

  if (isFailed) {
    return (
      <div style={{
        background: "rgba(255,100,100,0.05)",
        borderRadius: 16,
        border: "1px solid rgba(255,100,100,0.2)",
        padding: 20,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{ fontSize: 24 }}>❌</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: "rgba(255,255,255,0.7)", fontWeight: 600, fontSize: 14 }}>Generation failed</div>
          {video.error && <div style={{ color: "#FF6B6B", fontSize: 12, marginTop: 4 }}>{video.error.slice(0, 80)}</div>}
          <div style={{ color: "#555", fontSize: 11, marginTop: 4 }}>{fmtDate(video.created_at)}</div>
        </div>
        <button
          onClick={() => onDelete(video.id, video.source)}
          style={{
            background: "rgba(255,100,100,0.1)", border: "1px solid rgba(255,100,100,0.3)",
            color: "#FF6B6B", borderRadius: 8, padding: "6px 10px",
            cursor: "pointer", fontSize: 14, flexShrink: 0,
          }}
        >🗑</button>
      </div>
    );
  }

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      borderRadius: 16, overflow: "hidden",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      {/* Thumbnail / preview */}
      <div
        style={{
          position: "relative", aspectRatio: "9/16", overflow: "hidden",
          cursor: video.video_url ? "pointer" : "default",
          background: "rgba(0,0,0,0.3)",
        }}
        onClick={() => video.video_url && onPlay(video.video_url)}
      >
        {video.video_url ? (
          <>
            <video
              src={video.video_url}
              muted
              loop
              autoPlay
              playsInline
              preload="metadata"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            <div style={{
              position: "absolute", inset: 0,
              background: "rgba(0,0,0,0)",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.2s",
            }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(0,0,0,0.35)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(0,0,0,0)"; }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                background: "rgba(255,255,255,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20,
              }}>▶</div>
            </div>
          </>
        ) : (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "rgba(255,255,255,0.2)", fontSize: 32,
          }}>🎬</div>
        )}
      </div>

      {/* Card footer */}
      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{
            background: isAvatar ? "rgba(192,132,252,0.18)" : "rgba(201,168,76,0.18)",
            color: isAvatar ? "#C084FC" : "#C9A84C",
            padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700,
          }}>
            {isAvatar ? "👤 AVATAR" : "🎬 CINEMATIC"}
          </span>
          <span style={{ color: "#666", fontSize: 12 }}>{fmtDate(video.created_at)}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {video.video_url && (
            <a
              href={video.video_url}
              download
              style={{
                flex: 1, background: "rgba(201,168,76,0.12)",
                border: "1px solid rgba(201,168,76,0.35)",
                color: "#C9A84C", borderRadius: 8, padding: "7px 0",
                textAlign: "center", fontSize: 13, fontWeight: 700,
                textDecoration: "none",
              }}
            >⬇ Download</a>
          )}
          <button
            onClick={() => onDelete(video.id, video.source)}
            style={{
              background: "rgba(255,100,100,0.08)", border: "1px solid rgba(255,100,100,0.25)",
              color: "#FF6B6B", borderRadius: 8, padding: "7px 12px",
              cursor: "pointer", fontSize: 13,
            }}
          >🗑</button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyVideosPage() {
  const router = useRouter();
  const supabase = createClient();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [hasSavedProject, setHasSavedProject] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Check if there's a saved create session
    try {
      setHasSavedProject(!!sessionStorage.getItem("omnyra_create_state"));
    } catch { /* SSR guard */ }
  }, []);

  async function fetchVideos() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/signin"); return; }

    const [rendersRes, cinematicRes] = await Promise.all([
      supabase.from("renders").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("cinematic_jobs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    ]);

    const renders: VideoItem[] = (rendersRes.data ?? []).map((r) => ({
      ...r,
      source: "render" as const,
    }));

    const cinematicInProgress: VideoItem[] = (cinematicRes.data ?? [])
      .filter((j) => j.status !== "complete" && j.status !== "failed")
      .map((j) => ({ ...j, source: "cinematic_job" as const }));

    // Merge: in-progress jobs on top, completed renders after
    const merged: VideoItem[] = [
      ...cinematicInProgress,
      ...renders,
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setVideos(merged);
    setLoading(false);

    // Only poll if there are active jobs
    const hasActive = merged.some((v) => ACTIVE_STATUSES.has(v.status));
    if (!hasActive && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  useEffect(() => {
    fetchVideos();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start/stop polling based on active jobs
  useEffect(() => {
    const hasActive = videos.some((v) => ACTIVE_STATUSES.has(v.status));
    if (hasActive && !intervalRef.current) {
      intervalRef.current = setInterval(fetchVideos, 10_000);
    } else if (!hasActive && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos]);

  async function handleDelete(id: string, source: string) {
    if (!confirm("Delete this video?")) return;
    const table = source === "render" ? "renders" : "cinematic_jobs";
    await supabase.from(table).delete().eq("id", id);
    setVideos((prev) => prev.filter((v) => v.id !== id));
  }

  function handleNewProject() {
    try { sessionStorage.removeItem("omnyra_create_state"); } catch { /* ok */ }
    router.push("/create");
  }

  return (
    <div style={{ minHeight: "100vh", background: "transparent", color: "rgba(255,255,255,0.9)", position: "relative" }}>
      <AnimatedBackground />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {playingUrl && <VideoModal url={playingUrl} onClose={() => setPlayingUrl(null)} />}

      <div style={{ position: "relative", zIndex: 1, maxWidth: 900, margin: "0 auto", padding: "32px 20px 60px" }}>

        {/* Back button */}
        <button
          onClick={() => router.back()}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10, padding: "8px 16px",
            color: "white", cursor: "pointer", fontSize: 14,
            marginBottom: 28,
          }}
        >← Back</button>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: "1.8rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#C9A84C", margin: 0 }}>
              My Videos
            </h1>
            <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, marginTop: 4 }}>
              {videos.length} video{videos.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {hasSavedProject && (
              <button
                onClick={() => router.push("/create")}
                style={{
                  background: "linear-gradient(135deg, rgba(201,168,76,0.18), rgba(192,132,252,0.18))",
                  border: "1px solid rgba(201,168,76,0.4)",
                  borderRadius: 10, padding: "9px 18px",
                  color: "#C9A84C", fontWeight: 700, fontSize: 13, cursor: "pointer",
                }}
              >← Continue Project</button>
            )}
            <button
              onClick={handleNewProject}
              style={{
                background: "rgba(201,168,76,0.15)",
                border: "1px solid rgba(201,168,76,0.4)",
                borderRadius: 10, padding: "9px 18px",
                color: "#C9A84C", fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}
            >+ New Video</button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.3)" }}>
            Loading…
          </div>
        ) : videos.length === 0 ? (
          <div style={{
            borderRadius: 20, border: "1px dashed rgba(255,255,255,0.1)",
            padding: 60, textAlign: "center",
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🎬</div>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 15 }}>No videos yet. Create your first one!</p>
            <button
              onClick={handleNewProject}
              style={{
                marginTop: 20, background: "rgba(201,168,76,0.15)",
                border: "1px solid rgba(201,168,76,0.4)",
                borderRadius: 10, padding: "10px 24px",
                color: "#C9A84C", fontWeight: 700, fontSize: 14, cursor: "pointer",
              }}
            >Create a Video →</button>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 20,
          }}>
            {videos.map((v) => (
              <VideoCard
                key={v.id}
                video={v}
                onPlay={setPlayingUrl}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
