/**
 * hooks/useVideoProgress.ts
 *
 * Consumes the SSE stream from GET /api/render-progress?planId=<planId>
 * and maps parallel-engine events into a simple progress state.
 *
 * Usage:
 *   const { status, progress, stage, videoUrl, error } = useVideoProgress(planId);
 *   // planId is the shot_plans UUID — pass null to disable
 *
 * Events consumed (emitted by parallel-engine.ts via orchestration_events realtime):
 *   KLING_CLIP_READY         → progress increments per clip
 *   HEDRA_CLIP_READY         → progress increments per clip
 *   VOICEOVER_READY          → progress = 75
 *   STITCH_COMPLETE          → progress = 92
 *   PARALLEL_ENGINE_COMPLETE → status = "complete", videoUrl set
 *   PARALLEL_ENGINE_FAILED   → status = "failed", error set
 */

"use client";

import { useEffect, useRef, useState } from "react";

export interface VideoProgressData {
  status:    "idle" | "connecting" | "processing" | "complete" | "failed";
  progress:  number;       // 0–100
  stage?:    string;
  videoUrl?: string;
  error?:    string;
}

const INITIAL: VideoProgressData = { status: "idle", progress: 0 };

export function useVideoProgress(planId: string | null): VideoProgressData {
  const [state, setState] = useState<VideoProgressData>(INITIAL);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!planId) {
      setState(INITIAL);
      return;
    }

    esRef.current?.close();
    setState({ status: "connecting", progress: 0 });

    const es = new EventSource(`/api/render-progress?planId=${encodeURIComponent(planId)}`);
    esRef.current = es;

    let clipsReceived = 0;

    es.addEventListener("KLING_CLIP_READY", () => {
      clipsReceived++;
      setState(prev => ({
        ...prev,
        status:   "processing",
        stage:    "video clips generating",
        progress: Math.min(20 + clipsReceived * 20, 60),
      }));
    });

    es.addEventListener("HEDRA_CLIP_READY", () => {
      clipsReceived++;
      setState(prev => ({
        ...prev,
        status:   "processing",
        stage:    "avatar clip ready",
        progress: Math.min(20 + clipsReceived * 20, 60),
      }));
    });

    es.addEventListener("VOICEOVER_READY", () => {
      setState(prev => ({
        ...prev,
        status:   "processing",
        stage:    "voiceover ready",
        progress: Math.max(prev.progress, 75),
      }));
    });

    es.addEventListener("STITCH_COMPLETE", () => {
      setState(prev => ({
        ...prev,
        status:   "processing",
        stage:    "final assembly",
        progress: 92,
      }));
    });

    es.addEventListener("PARALLEL_ENGINE_COMPLETE", (e: Event) => {
      let videoUrl: string | undefined;
      try {
        const data = JSON.parse((e as MessageEvent).data) as { assembled_url?: string; video_url?: string };
        videoUrl = data.assembled_url ?? data.video_url;
      } catch { /* no payload */ }
      setState({ status: "complete", progress: 100, stage: "done", videoUrl });
      es.close();
    });

    es.addEventListener("PARALLEL_ENGINE_FAILED", (e: Event) => {
      let errorMsg = "Generation failed";
      try {
        const data = JSON.parse((e as MessageEvent).data) as { error?: string };
        if (data.error) errorMsg = data.error;
      } catch { /* no payload */ }
      setState({ status: "failed", progress: 0, stage: "failed", error: errorMsg });
      es.close();
    });

    es.addEventListener("PROGRESS", (e: Event) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as { pct?: number; stage?: string };
        setState(prev => ({
          ...prev,
          status:   "processing",
          progress: data.pct  ?? prev.progress,
          stage:    data.stage ?? prev.stage,
        }));
      } catch { /* ignore */ }
    });

    es.onerror = () => {
      setState(prev => {
        if (prev.status === "complete" || prev.status === "failed") return prev;
        return { ...prev, status: "processing", stage: "reconnecting…" };
      });
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [planId]);

  return state;
}
