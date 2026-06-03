"use client";

/**
 * AssetUpload — drag-drop file uploader backed by a single `user-uploads` bucket.
 *
 * Paths (policy requires first segment = auth.uid()):
 *   variant="avatar"  → user-uploads/{userId}/avatar/reference.mp4
 *   variant="scene"   → user-uploads/{userId}/scene/{timestamp}_{filename}
 */

import { useRef, useState, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// ── Config per variant ────────────────────────────────────────────────────────

const BUCKET = "user-uploads";

const VARIANT_CONFIG = {
  avatar: {
    accept:        "video/mp4,video/quicktime,video/webm",
    subPath:       (userId: string, _file: File) => `${userId}/avatar/reference.mp4`,
    label:         "Drop your reference video here",
    hint:          "MP4, MOV, or WebM · 5–30s · clear front-facing shot · under 100 MB",
    maxBytes:      100 * 1024 * 1024,
    maxBytesLabel: "100 MB",
    isVideo:       true,
    mimeCheck:     (f: File) => f.type.startsWith("video/"),
  },
  scene: {
    accept:        "image/jpeg,image/png,image/webp",
    subPath:       (userId: string, file: File) => {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      return `${userId}/scene/${Date.now()}_${safeName}`;
    },
    label:         "Drop a scene image here",
    hint:          "JPEG, PNG, or WebP · under 10 MB",
    maxBytes:      10 * 1024 * 1024,
    maxBytesLabel: "10 MB",
    isVideo:       false,
    mimeCheck:     (f: File) => f.type.startsWith("image/"),
  },
} as const;

// ── Props ─────────────────────────────────────────────────────────────────────

interface AssetUploadProps {
  variant: "avatar" | "scene";
  userId: string;
  /** Called with the public URL after a successful upload */
  onUploaded: (url: string) => void;
  /** Optional initial URL to display as existing asset */
  initialUrl?: string;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AssetUpload({
  variant,
  userId,
  onUploaded,
  initialUrl,
  className,
}: AssetUploadProps) {
  const cfg     = VARIANT_CONFIG[variant];
  const inputRef = useRef<HTMLInputElement>(null);

  const [assetUrl,  setAssetUrl]  = useState<string | null>(initialUrl ?? null);
  const [dragging,  setDragging]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [error,     setError]     = useState("");

  const upload = useCallback(async (file: File) => {
    setError("");

    if (!cfg.mimeCheck(file)) {
      setError(`Invalid file type. ${cfg.hint}`);
      return;
    }
    if (file.size > cfg.maxBytes) {
      setError(`File too large — maximum is ${cfg.maxBytesLabel}.`);
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      const path = cfg.subPath(userId, file);
      const db   = getSupabase();

      const { error: upErr } = await db.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: true });

      if (upErr) throw new Error(upErr.message);

      const { data: { publicUrl } } = db.storage.from(BUCKET).getPublicUrl(path);
      setAssetUrl(publicUrl);
      setProgress(100);
      onUploaded(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [cfg, userId, onUploaded]);  

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    upload(files[0]);
  }, [upload]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const handleRemove = () => {
    setAssetUrl(null);
    setProgress(0);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const border = dragging
    ? "2px dashed #7c6fff"
    : assetUrl
    ? "2px solid rgba(34,197,94,0.4)"
    : "2px dashed rgba(255,255,255,0.15)";

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !uploading && !assetUrl && inputRef.current?.click()}
        style={{
          border,
          borderRadius: 12,
          padding: "28px 20px",
          textAlign: "center",
          cursor: assetUrl || uploading ? "default" : "pointer",
          background: dragging ? "rgba(124,111,255,0.08)" : "rgba(255,255,255,0.03)",
          transition: "all 0.15s",
          position: "relative",
        }}
      >
        {/* Preview */}
        {assetUrl && !uploading && (
          <div style={{ marginBottom: 12 }}>
            {cfg.isVideo ? (
              <video
                src={assetUrl}
                controls
                style={{ maxWidth: 240, maxHeight: 180, borderRadius: 8, display: "block", margin: "0 auto" }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={assetUrl}
                alt="Scene preview"
                style={{ maxWidth: 240, maxHeight: 180, borderRadius: 8, objectFit: "cover", display: "block", margin: "0 auto" }}
              />
            )}
          </div>
        )}

        {/* Upload state */}
        {uploading ? (
          <div style={{ color: "rgba(245,243,255,0.6)", fontSize: 13 }}>
            <ProgressRing pct={progress} />
            <div style={{ marginTop: 8 }}>Uploading…</div>
          </div>
        ) : assetUrl ? (
          <div style={{ color: "rgba(34,197,94,0.9)", fontSize: 12, fontWeight: 600 }}>
            Uploaded successfully
          </div>
        ) : (
          <>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{cfg.isVideo ? "🎥" : "🖼️"}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(245,243,255,0.85)", marginBottom: 4 }}>
              {cfg.label}
            </div>
            <div style={{ fontSize: 12, color: "rgba(245,243,255,0.4)" }}>
              or <span style={{ color: "#7c6fff", textDecoration: "underline" }}>browse</span>
              {" · "}{cfg.hint}
            </div>
          </>
        )}
      </div>


      {/* Actions row */}
      {assetUrl && !uploading && (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={() => inputRef.current?.click()}
            style={btnStyle("secondary")}
          >
            Replace
          </button>
          <button onClick={handleRemove} style={btnStyle("danger")}>
            Remove
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ fontSize: 12, color: "#ef4444", padding: "6px 10px", background: "rgba(239,68,68,0.1)", borderRadius: 6 }}>
          {error}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={cfg.accept}
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />

      <style>{`@keyframes assetUploadSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Micro helpers ─────────────────────────────────────────────────────────────

function ProgressRing({ pct }: { pct: number }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={44} height={44} style={{ display: "block", margin: "0 auto" }}>
      <circle cx={22} cy={22} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={3} />
      <circle
        cx={22} cy={22} r={r}
        fill="none"
        stroke="#7c6fff"
        strokeWidth={3}
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct / 100)}
        strokeLinecap="round"
        transform="rotate(-90 22 22)"
        style={{ transition: "stroke-dashoffset 0.3s ease" }}
      />
    </svg>
  );
}

function btnStyle(variant: "secondary" | "danger"): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 600,
    padding: "5px 12px",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    background: variant === "danger" ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.06)",
    color:      variant === "danger" ? "#ef4444"              : "rgba(245,243,255,0.7)",
  };
}
