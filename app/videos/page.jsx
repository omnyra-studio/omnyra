"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Download,
  Share2,
  MoreHorizontal,
  Loader2,
  Play,
  Sparkles,
  X,
  Check,
  Film,
} from "lucide-react";
import { supabase as supabaseClient } from "@/lib/supabase";
import * as Q from "@/lib/db/query";
import { SCHEMA } from "@/lib/db/schema";
import AnimatedBackground from "@/components/AnimatedBackground";

const TEMPLATE_FILTERS = [
  { id: "all", label: "All" },
  { id: "ugc-ad", label: "UGC Ad" },
  { id: "storytime", label: "Storytime" },
  { id: "influencer", label: "Influencer" },
  { id: "product-launch", label: "Product Launch" },
  { id: "faceless", label: "Faceless" },
];

const TEMPLATE_BADGE = {
  "ugc-ad": "bg-violet-500/15 text-violet-300 border-violet-500/30",
  storytime: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  influencer: "bg-pink-500/15 text-pink-300 border-pink-500/30",
  "product-launch": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  faceless: "bg-white/10 text-white/70 border-white/20",
};

const PAGE_SIZE = 12;

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toDateString();
}

function Toast({ message, kind = "success", onDone }) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => onDone?.(), 4000);
    return () => clearTimeout(id);
  }, [message, onDone]);

  if (!message) return null;
  const palette =
    kind === "error"
      ? "bg-rose-900/90 border-rose-500/30 text-rose-100"
      : "bg-emerald-900/90 border-emerald-500/30 text-emerald-100";

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl border backdrop-blur-md text-sm shadow-[0_20px_40px_-20px_rgba(0,0,0,0.5)] ${palette}`}
      role="status"
    >
      {message}
    </div>
  );
}

function ScriptModal({ script, onClose }) {
  if (script == null) return null;
  return (
    <div className="fixed inset-0 z-50 bg-[#2D0A3E]/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#0c0c14] border border-white/10 rounded-2xl p-6 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-white">Your Script</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <pre className="font-mono whitespace-pre-wrap text-white/80 text-sm leading-relaxed">
          {script || "No script saved for this render."}
        </pre>
      </div>
    </div>
  );
}

function VideoCard({
  video,
  onView,
  onShare,
  onDownload,
  onRecreate,
  onDelete,
  menuOpen,
  setMenuOpen,
}) {
  const status = video.status;
  const isComplete = status === "complete" || status === "completed";
  const isProcessing = status === "processing" || status === "pending" || status === "rendering";
  const isFailed = status === "failed" || status === "error";
  const template = video.template ?? video.director_settings?.template ?? null;

  return (
    <div className="rounded-2xl overflow-hidden border border-white/10 bg-white/5 backdrop-blur-sm flex flex-col">
      <div className="relative aspect-[9/16] bg-gradient-to-br from-violet-900/30 to-cyan-900/20 group overflow-hidden">
        {isComplete && video.video_url ? (
          <>
            <video
              src={video.video_url}
              className="absolute inset-0 w-full h-full object-cover"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
            />
            <div className="absolute inset-0 bg-[#2D0A3E]/0 group-hover:bg-[#2D0A3E]/30 transition-colors flex items-center justify-center pointer-events-none">
              <Play className="w-10 h-10 text-white opacity-0 group-hover:opacity-90 transition-opacity" />
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/60">
            {isFailed ? (
              <>
                <X className="w-8 h-8 text-rose-400" />
                <span className="text-sm">Render failed</span>
              </>
            ) : (
              <>
                <Loader2 className="w-8 h-8 animate-spin text-violet-300" />
                <span className="text-sm">Processing…</span>
              </>
            )}
          </div>
        )}

        {template && TEMPLATE_BADGE[template] && (
          <span
            className={`absolute top-3 left-3 text-[10px] uppercase tracking-widest border rounded-full px-2 py-1 ${TEMPLATE_BADGE[template]}`}
          >
            {template.replace("-", " ")}
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs">
          <div>
            {isComplete && (
              <span className="text-emerald-400 inline-flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" /> Complete
              </span>
            )}
            {isProcessing && (
              <span className="text-amber-400 inline-flex items-center gap-1.5 animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Rendering…
              </span>
            )}
            {isFailed && (
              <span className="text-rose-400 inline-flex items-center gap-1.5">
                <X className="w-3.5 h-3.5" /> Failed
              </span>
            )}
          </div>
          <span className="text-white/40">{fmtDate(video.created_at)}</span>
        </div>

        <div className="flex items-center justify-between gap-2 relative">
          <div className="flex gap-2">
            <button
              onClick={() => onDownload(video)}
              disabled={!isComplete || !video.video_url}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-violet-500/40 hover:text-white text-xs text-white/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
            <button
              onClick={() => onShare(video)}
              disabled={!video.video_url}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-violet-500/40 hover:text-white text-xs text-white/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </button>
          </div>

          <div className="relative">
            <button
              onClick={() => setMenuOpen(menuOpen ? null : video.id)}
              className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 hover:border-violet-500/40 hover:text-white text-white/60 inline-flex items-center justify-center transition-colors"
              aria-label="More options"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen === video.id && (
              <div className="absolute right-0 bottom-10 z-20 w-44 rounded-xl bg-[#11121b] border border-white/10 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.6)] overflow-hidden">
                <button
                  onClick={() => {
                    onView(video);
                    setMenuOpen(null);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-white/80 hover:bg-white/5"
                >
                  View script
                </button>
                <button
                  onClick={() => {
                    onRecreate(video);
                    setMenuOpen(null);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-white/80 hover:bg-white/5"
                >
                  Recreate
                </button>
                <button
                  onClick={() => {
                    onDelete(video);
                    setMenuOpen(null);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-rose-300 hover:bg-rose-500/10"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MyVideosPage() {
  const router = useRouter();
  const supabaseRef = useRef(null);
  const supabase = supabaseClient;

  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedScript, setSelectedScript] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);
  const [userId, setUserId] = useState(null);
  const [toast, setToast] = useState({ kind: "success", message: "" });
  const [activeTab, setActiveTab] = useState("content");

  function showToast(message, kind = "success") {
    setToast({ kind, message });
  }

  // Initial fetch + auth gate
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/signin");
        return;
      }
      if (cancelled) return;
      setUserId(user.id);

      const renders = await Q.renders(supabase).forUser(user.id)
        .order(SCHEMA.renders.columns.createdAt, { ascending: false })
        .range(0, PAGE_SIZE - 1);

      if (cancelled) return;

      const rows = renders.data ?? [];
      setVideos(rows);
      setHasMore(rows.length === PAGE_SIZE);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  // Realtime updates on renders
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`renders:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: SCHEMA.renders.table,
          filter: Q.renders(supabase).realtimeFilter(userId),
        },
        (payload) => {
          const next = payload.new;
          setVideos((prev) =>
            prev.map((v) => (v.id === next.id ? { ...v, ...next } : v)),
          );
          if (next?.status === "complete" || next?.status === "completed") {
            showToast("✓ Your video is ready to download");
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: SCHEMA.renders.table,
          filter: Q.renders(supabase).realtimeFilter(userId),
        },
        (payload) => {
          setVideos((prev) => [payload.new, ...prev]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, supabase]);

  async function loadMore() {
    if (!userId || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data } = await Q.renders(supabase).forUser(userId)
      .order(SCHEMA.renders.columns.createdAt, { ascending: false })
      .range(from, to);
    const rows = data ?? [];
    setVideos((prev) => [...prev, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
    setPage((p) => p + 1);
    setLoadingMore(false);
  }

  const filteredVideos = useMemo(() => {
    const base =
      filter === "all"
        ? videos
        : videos.filter(
            (v) =>
              v.template === filter ||
              v.director_settings?.template === filter,
          );
    if (sort === "oldest") {
      return [...base].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    }
    return base;
  }, [videos, filter, sort]);

  async function handleDownload(video) {
    if (!video.video_url) return;
    try {
      const res = await fetch(video.video_url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `omnyra-${video.id}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      showToast("Couldn't start the download.", "error");
    }
  }

  async function handleShare(video) {
    if (!video.video_url) return;
    try {
      await navigator.clipboard.writeText(video.video_url);
      showToast("Copied!");
    } catch {
      showToast("Copy failed.", "error");
    }
  }

  async function handleDelete(video) {
    const { error } = await supabase.from(SCHEMA.renders.table).delete().eq(SCHEMA.renders.columns.id, video.id);
    if (error) {
      showToast("Couldn't delete.", "error");
      return;
    }
    setVideos((prev) => prev.filter((v) => v.id !== video.id));
  }

  function handleRecreate(video) {
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen text-white" style={{ position: 'relative', background: 'transparent', color: 'rgba(255,255,255,0.9)' }}>
      <AnimatedBackground />
      <div style={{ position: 'relative', zIndex: 1 }}>

      <main className="max-w-6xl mx-auto px-6 py-10 md:py-14">
        <section className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <div className="page-title" style={{ fontSize: "2rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#C9A84C", marginBottom: "4px" }}>
              My Library
            </div>
            <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>
              Everything you&apos;ve directed with Omnyra.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="px-4 py-2 rounded-full gold-btn" style={{ fontSize: '1rem', fontWeight: 700 }}>
              New video →
            </Link>
          </div>
        </section>

        <section className="flex flex-col gap-3 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            {TEMPLATE_FILTERS.map((f) => {
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={[
                    "px-4 py-2 rounded-full transition-colors",
                    active
                      ? "bg-violet-500 shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                      : "border border-white/10 hover:border-white/20",
                  ].join(" ")}
                  style={{
                    fontSize: '1rem',
                    fontWeight: active ? 700 : 600,
                    color: active ? 'white' : 'rgba(255,255,255,0.92)',
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between">
            <p style={{ fontSize: '1.1rem', fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>
              {filteredVideos.length} video{filteredVideos.length === 1 ? "" : "s"} created
            </p>
            <div className="inline-flex items-center gap-1 p-1 rounded-full bg-white/3 border border-white/10">
              {["newest", "oldest"].map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={[
                    "px-3 py-1.5 rounded-full capitalize transition-colors",
                    sort === s ? "bg-white/10" : "",
                  ].join(" ")}
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: sort === s ? 700 : 600,
                    color: sort === s ? 'white' : 'rgba(255,255,255,0.9)',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </section>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-2xl overflow-hidden border border-white/10 bg-white/3"
              >
                <div className="aspect-[9/16] bg-white/5 animate-pulse" />
                <div className="p-4 h-20 bg-white/3 animate-pulse" />
              </div>
            ))}
          </div>
        ) : filteredVideos.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/3 p-14 text-center">
            <Film className="w-12 h-12 text-white/30 mx-auto mb-5" />
            <h2 className="text-xl font-semibold mb-2">No videos yet</h2>
            <p className="text-sm text-white/45 mb-7 max-w-sm mx-auto">
              Your AI-generated videos will appear here.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold shadow-[0_0_30px_rgba(139,92,246,0.35)] transition-colors"
            >
              Create your first video →
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredVideos.map((v) => (
                <VideoCard
                  key={v.id}
                  video={v}
                  onView={(video) => setSelectedScript(video.script ?? "")}
                  onShare={handleShare}
                  onDownload={handleDownload}
                  onRecreate={handleRecreate}
                  onDelete={handleDelete}
                  menuOpen={menuOpen}
                  setMenuOpen={setMenuOpen}
                />
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center mt-10">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/80 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                    </>
                  ) : (
                    "Load more"
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <ScriptModal
        script={selectedScript}
        onClose={() => setSelectedScript(null)}
      />
      <Toast
        message={toast.message}
        kind={toast.kind}
        onDone={() => setToast({ ...toast, message: "" })}
      />
      </div>
    </div>
  );
}
