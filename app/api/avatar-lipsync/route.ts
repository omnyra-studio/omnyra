/**
 * POST /api/avatar-lipsync
 *
 * Turns any selected/generated image into a talking character video.
 *
 * Pipeline (two stages, ~75–105s total):
 *   Stage 1 — Kling v2.1 pro (≤45s)
 *     image → 10s animated video (micro head motion, blinks — no mouth)
 *
 *   Stage 2 — SyncLabs (≤60s)
 *     animated video + voiceover audio → lip-synced talking character
 *
 * Env vars: FAL_API_KEY, SYNCLABS_API_KEY
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { generateTalkingAvatar } from "@/lib/avatar-provider";

export const maxDuration = 300;

export async function POST(req: Request) {
  const routeT0 = Date.now();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { imageUrl?: string; audioUrl?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { imageUrl, audioUrl } = body;
  if (!imageUrl?.startsWith("https://")) {
    return Response.json({ error: "imageUrl must be a valid https URL" }, { status: 400 });
  }
  if (!audioUrl?.startsWith("https://")) {
    return Response.json({ error: "audioUrl must be a valid https URL" }, { status: 400 });
  }

  // ── Generate ──────────────────────────────────────────────────────────────
  try {
    const result = await generateTalkingAvatar({ imageUrl, audioUrl });
    const totalMs = Date.now() - routeT0;
    console.log(`[TIMING] avatar-lipsync TOTAL ${totalMs}ms`);

    return Response.json({
      success:            true,
      video_url:          result.videoUrl,
      animated_video_url: result.animatedVideoUrl,
      timing_ms:          { ...result.timingMs, route_total: totalMs },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isStage1 = msg.includes("Kling") || msg.includes("animate");
    console.error(`[avatar-lipsync] ${isStage1 ? "STAGE1" : "STAGE2"} FAILED:`, msg);
    return Response.json(
      { error: msg, stage: isStage1 ? "animate" : "lipsync" },
      { status: 500 },
    );
  }
}
