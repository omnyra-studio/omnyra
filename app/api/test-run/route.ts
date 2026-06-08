// Internal engine test endpoint — CRON_SECRET gated, never ship to prod permanently.
// Accepts planId + characterId, runs engine as given userId, returns result.
// DELETE THIS FILE after confirming the engine works end-to-end.

import { NextResponse }       from "next/server";
import { supabaseAdmin }      from "@/lib/supabase/admin";
import { runParallelEngine }  from "@/lib/orchestrator/parallel-engine";
import { fal }               from "@fal-ai/client";
import { KLING_T2V_PRO }     from "@/lib/video-models";

export const maxDuration = 300;

// GET /api/test-run — direct fal.ai probe (no engine, no DB)
export async function GET(req: Request) {
  const secret = req.headers.get("x-test-secret") ?? new URL(req.url).searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const FAL_CREDS = process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY;
  if (FAL_CREDS) fal.config({ credentials: FAL_CREDS });
  const t0 = Date.now();
  try {
    const result = await fal.subscribe(KLING_T2V_PRO, {
      input: { prompt: "a red ball on a table", duration: "5", aspect_ratio: "9:16" },
    });
    return NextResponse.json({ ok: true, model: KLING_T2V_PRO, ms: Date.now() - t0, result });
  } catch (err) {
    return NextResponse.json({ ok: false, model: KLING_T2V_PRO, ms: Date.now() - t0, error: err instanceof Error ? err.message : String(err) });
  }
}

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
