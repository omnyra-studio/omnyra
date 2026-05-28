"use client";

import { useState, useRef, useEffect } from "react";
import { getUserTier, TIER_VIDEO_LIMITS, type UserTier } from "@/lib/getUserTier";

export function useVideoGeneration() {
  const [userTier, setUserTier] = useState<UserTier>("free");
  const [tierLimits, setTierLimits] = useState<typeof TIER_VIDEO_LIMITS[UserTier]>(TIER_VIDEO_LIMITS.free);
  const [videoType, setVideoType] = useState<string | null>(null);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getUserTier().then(tier => {
      setUserTier(tier);
      setTierLimits(TIER_VIDEO_LIMITS[tier]);
    });
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleGenerateVideo = async (
    type: string,
    concept: string,
    selectedImage?: string | null,
  ) => {
    setVideoError(null);
    setVideoUrl(null);
    setVideoType(type);
    setIsGeneratingVideo(true);
    setVideoProgress(10);

    try {
      if (type === "fast") {
        const res = await fetch("/api/generate-video-fal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: concept, model: "fast", image_url: selectedImage || undefined }),
        });
        if (!res.ok) throw new Error("Fast video generation failed");
        const data = await res.json();
        if (!data.video_url) throw new Error(data.error || "No video URL returned");
        setVideoUrl(data.video_url);
        setVideoProgress(100);

      } else if (type === "cinematic") {
        const res = await fetch("/api/generate-video-kling", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: concept,
            image_url: selectedImage || undefined,
            duration: "5",
            aspect_ratio: "9:16",
            quality: "high",
          }),
        });
        if (!res.ok) throw new Error("Cinematic video submission failed");
        const { task_id } = await res.json();
        setVideoProgress(30);

        let pollCount = 0;
        pollRef.current = setInterval(async () => {
          pollCount++;
          if (pollCount > 60) {
            clearInterval(pollRef.current!);
            setIsGeneratingVideo(false);
            setVideoError("Timed out — please try again");
            return;
          }
          try {
            const check = await fetch(`/api/check-kling?task_id=${task_id}`);
            const { status, video_url } = await check.json();
            if (status === "succeed" && video_url) {
              clearInterval(pollRef.current!);
              setVideoUrl(video_url);
              setVideoProgress(100);
              setIsGeneratingVideo(false);
            } else if (status === "failed") {
              clearInterval(pollRef.current!);
              setIsGeneratingVideo(false);
              setVideoError("Render failed — please try again");
            } else {
              setVideoProgress(p => Math.min(p + 3, 90));
            }
          } catch {
            clearInterval(pollRef.current!);
            setIsGeneratingVideo(false);
          }
        }, 5000);
        return;

      } else if (type === "sequence") {
        const splitRes = await fetch("/api/split-script", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script: concept, num_segments: 4 }),
        });
        if (!splitRes.ok) throw new Error("Script splitting failed");
        const { segments } = await splitRes.json();
        setVideoProgress(20);

        const seqRes = await fetch("/api/generate-video-sequence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompts: (segments as { visual_prompt: string }[]).map(s => s.visual_prompt),
            image_urls: selectedImage ? [selectedImage] : [],
            clip_length: 15,
            model: "cinematic",
          }),
        });
        setVideoProgress(80);
        const seqData = await seqRes.json();
        if (!seqRes.ok) throw new Error(seqData.error || "Sequence generation failed");
        setVideoUrl(seqData.video_url);
        setVideoProgress(100);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("Video generation error:", msg);
      setVideoError(`Generation failed: ${msg} — please try again`);
      setVideoProgress(0);
    } finally {
      if (type !== "cinematic") setIsGeneratingVideo(false);
    }
  };

  const resetVideo = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setVideoUrl(null);
    setVideoError(null);
    setVideoProgress(0);
    setIsGeneratingVideo(false);
    setVideoType(null);
  };

  return {
    userTier,
    tierLimits,
    videoType,
    setVideoType,
    isGeneratingVideo,
    videoUrl,
    videoProgress,
    videoError,
    showUpgradeModal,
    setShowUpgradeModal,
    handleGenerateVideo,
    resetVideo,
  };
}
