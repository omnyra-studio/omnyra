// Internal engine test endpoint — CRON_SECRET gated, never ship to prod permanently.
// Accepts planId + characterId, runs engine as given userId, returns result.
// DELETE THIS FILE after confirming the engine works end-to-end.

import { NextResponse }       from "next/server";
import { supabaseAdmin }      from "@/lib/supabase/admin";
import { runParallelEngine }  from "@/lib/orchestrator/parallel-engine";

export const maxDuration = 300;

export async function POST(req: Request) {
  const secret = req.headers.get("x-test-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    planId:              string;
    userId:              string;
    characterIds?:       string[];
    voiceId?:            string;
    fullScript?:         string;
    speedMode?:          string;
    maxClips?:           number;
    skipStitch?:         boolean;
    targetDurationSecs?: number;
  };

  const { planId, userId, characterIds, voiceId, fullScript, speedMode = "draft", maxClips = 2, skipStitch = false, targetDurationSecs = 30 } = body;
  if (!planId || !userId) return NextResponse.json({ error: "planId + userId required" }, { status: 400 });

  console.info("[test-run] starting engine", { planId, userId, speedMode, maxClips, skipStitch, targetDurationSecs });

  try {
    const result = await runParallelEngine({
      planId,
      userId,
      characterIds,
      voiceId,
      fullScript,
      speedMode:         speedMode as 'ultra-draft' | 'draft' | 'balanced' | 'quality',
      maxClips,
      targetDurationSecs,
      draftMode:         true,
      skipStitch,
    });

    return NextResponse.json({
      ok:                true,
      planId:            result.planId,
      clips:             result.clips.length,
      hedra:             result.hedraCount,
      kling:             result.klingCount,
      failed:            result.failedShots,
      totalMs:           result.totalMs,
      assembledUrl:      result.assembledUrl ?? null,
      voiceoverUrl:      result.voiceoverUrl ?? null,
      voiceDurationSecs: result.voiceDurationSecs ?? null,
      targetDurationSecs: result.targetDurationSecs,
      clipUrls:          result.clips.map(c => ({ n: c.shotNumber, url: c.video_url, ms: c.generation_ms, provider: c.provider, secs: c.duration_seconds })),
    });
  } catch (err) {
    console.error("[test-run] engine error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
