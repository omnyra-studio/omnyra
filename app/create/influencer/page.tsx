"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AssetUpload from "@/components/AssetUpload";

function InfluencerPageInner() {
  const router = useRouter();
  const [authLoading, setAuthLoading]   = useState(true);
  const [userId, setUserId]             = useState<string | null>(null);
  const [avatarRefUrl, setAvatarRefUrl] = useState<string | null>(null);

  useEffect(() => {
    const sb = createClient();
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace("/signin"); return; }
      setUserId(session.user.id);
      setAuthLoading(false);

      sb.from("profiles")
        .select("avatar_reference_video_url")
        .eq("id", session.user.id)
        .single()
        .then(({ data }) => {
          if (!data) return;
          setAvatarRefUrl(data.avatar_reference_video_url as string | null);
        });
    });
  }, [router]);

  async function handleVideoUploaded(url: string) {
    setAvatarRefUrl(url);
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      await sb.from("profiles").update({ avatar_reference_video_url: url }).eq("id", user.id);
    }
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#C084FC", animation: "pulseSoft 1.5s ease-in-out infinite" }} />
      </div>
    );
  }

  const avatarReady = !!avatarRefUrl;

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.2em",
            textTransform: "uppercase", color: "#E879F9", marginBottom: 12,
          }}>
            Create Mode
          </div>
          <h1 style={{
            fontSize: "clamp(1.8rem, 5vw, 2.4rem)", fontWeight: 700, margin: "0 0 12px",
            background: "linear-gradient(105deg, #CFA42F, #F7D96B, #CFA42F)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>
            AI Influencer
          </h1>
          <p style={{ color: "#BBA8C8", fontSize: 14, lineHeight: 1.7, margin: 0 }}>
            Create content that looks and sounds like you — powered by your Digital Twin.
            <br />Your avatar delivers your script, in your voice, with your style.
          </p>
        </div>

        {/* Avatar Status Card */}
        <div className="glass-card" style={{ borderRadius: 20, padding: "28px 24px", marginBottom: 24 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.15em",
            textTransform: "uppercase", color: "#7c6fff", marginBottom: 20,
          }}>
            Digital Twin Setup
          </div>

          {/* State A — no reference video uploaded yet */}
          {!avatarRefUrl && userId && (
            <>
              <p style={{ color: "#BBA8C8", fontSize: 13, lineHeight: 1.65, margin: "0 0 20px" }}>
                Upload a short reference video to set up your avatar. Use a clear
                front-facing shot — 5 to 30 seconds, good lighting, minimal background noise.
              </p>
              <AssetUpload
                variant="avatar"
                userId={userId}
                onUploaded={handleVideoUploaded}
              />
            </>
          )}

          {/* State B — reference video uploaded, ready */}
          {avatarReady && (
            <>
              <video
                src={avatarRefUrl!}
                muted
                playsInline
                style={{
                  width: "100%", maxHeight: 200, objectFit: "cover",
                  borderRadius: 10, marginBottom: 16, background: "#000",
                  border: "1px solid rgba(34,197,94,0.2)",
                }}
              />
              <div style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 16px", borderRadius: 10,
                background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)",
                marginBottom: 16,
              }}>
                <span style={{ fontSize: 18 }}>✅</span>
                <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(34,197,94,0.9)" }}>
                  Your avatar reference is set
                </div>
              </div>
              <p style={{ color: "#8A7D92", fontSize: 12, margin: 0 }}>
                Want to update your avatar? Go to{" "}
                <Link href="/dashboard/settings" style={{ color: "#7c6fff" }}>
                  Settings → Avatar
                </Link>.
              </p>
            </>
          )}
        </div>

        {/* Primary CTA */}
        <button
          onClick={() => router.push("/create?template=influencer")}
          disabled={!avatarReady}
          className={avatarReady ? "gold-btn" : undefined}
          style={{
            width: "100%",
            padding: "16px 24px",
            borderRadius: 9999,
            border: "none",
            fontSize: 16,
            fontWeight: 700,
            fontFamily: "inherit",
            cursor: avatarReady ? "pointer" : "not-allowed",
            ...(!avatarReady ? { background: "rgba(255,255,255,0.06)", color: "#8A7D92" } : {}),
          }}
        >
          {avatarReady ? "Create Influencer Content →" : "Upload your reference video above"}
        </button>

        {!avatarReady && (
          <p style={{ textAlign: "center", fontSize: 12, color: "#8A7D92", marginTop: 10 }}>
            Upload your reference video to enable avatar content.
          </p>
        )}

        {/* Skip option */}
        {!avatarReady && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button
              onClick={() => router.push("/create?template=influencer")}
              style={{
                background: "none", border: "none", fontFamily: "inherit",
                color: "#8A7D92", fontSize: 12, cursor: "pointer",
                textDecoration: "underline", textUnderlineOffset: 3,
              }}
            >
              Skip → Use an AI-generated persona instead
            </button>
          </div>
        )}

      </div>
      <style>{`@keyframes influencerSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function InfluencerPage() {
  return (
    <Suspense>
      <InfluencerPageInner />
    </Suspense>
  );
}
