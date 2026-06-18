/**
 * POST /api/generate-shot
 *
 * Generates ONE shot and saves the resulting clip URL to the shots table.
 *
 * Video shots: Kling DIRECT ONLY (true animation, faster, no Fal).
 * text_overlay: Flux sync (unchanged).
 *
 * Returns clip immediately for video (direct call) or queued for overlay.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  executeShot,
  executeDirectKlingShot,
} from "@/lib/shot-executor";
import type { ShotPacket } from "@/lib/types/shot";
import type { ShotAssets } from "@/lib/shot-executor";

export const maxDuration = 300;

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { shotId: string; voiceId?: string; voiceText?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { shotId, voiceId = undefined, voiceText = undefined } = body;
  if (!shotId?.trim()) {
    return NextResponse.json({ error: "Missing required field: shotId" }, { status: 400 });
  }

  // ── Load shot + verify ownership ─────────────────────────────────────────────
  const { data: shot, error: shotErr } = await supabase
    .from("shots")
    .select("*, shot_plans!inner(project_id, projects!inner(user_id))")
    .eq("shot_id", shotId)
    .single();

  if (shotErr || !shot) {
    return NextResponse.json({ error: "Shot not found" }, { status: 404 });
  }

   
  const ownerId = (shot as any).shot_plans?.projects?.user_id as string | undefined;
  if (ownerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Load avatar assets ────────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("voice_id")
    .eq("id", user.id)
    .single();

  const assets: ShotAssets = {
    voiceId:   voiceId  ?? profile?.voice_id ?? undefined,
    voiceText: voiceText ?? undefined,
  };

  // ── Scene image gate ─────────────────────────────────────────────────────────
  if (shot.content_type !== "text_overlay" && !shot.scene_image_url) {
    return NextResponse.json(
      { error: `No scene image for shot ${shot.shot_number}. Generate scene images first.` },
      { status: 400 },
    );
  }

  // ── Route decision ────────────────────────────────────────────────────────────
  const isVideoShot = shot.content_type !== "text_overlay";

  // ── Mark as rendering ────────────────────────────────────────────────────────
  await supabase
    .from("shots")
    .update({ render_status: "rendering", render_error: null })
    .eq("shot_id", shotId);

  // ── Video shots: Kling DIRECT ONLY (actual animation, faster, no Fal/Seedance) ─
  if (isVideoShot) {
    const res = await executeDirectKlingShot(shot as ShotPacket);
    await supabase
      .from("shots")
      .update({
        clip_url: res.videoUrl,
        render_status: "completed",
        render_error: null,
      })
      .eq("shot_id", shotId);

    return NextResponse.json({
      success: true,
      status: "completed",
      clip_url: res.videoUrl,
      duration: res.duration,
      shot_db_id: shot.id,
    });
  }

  // ── Sync path (text_overlay only) ────────────────────────────────────────────
  let result;
  try {
    result = await executeShot(shot as ShotPacket, assets);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error during shot execution";
    console.error(`[generate-shot] shot ${shot.shot_number} threw:`, msg);
    await supabase
      .from("shots")
      .update({ render_status: "failed", render_error: msg })
      .eq("shot_id", shotId);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (!result) {
    await supabase
      .from("shots")
      .update({ render_status: "failed", render_error: "Shot generation failed after retries" })
      .eq("shot_id", shotId);
    return NextResponse.json(
      { error: `Shot ${shot.shot_number} generation failed after retries` },
      { status: 500 },
    );
  }

  const { error: updateErr } = await supabase
    .from("shots")
    .update({ clip_url: result.videoUrl, render_status: "completed", render_error: null })
    .eq("shot_id", shotId);

  if (updateErr) {
    console.error("[generate-shot] failed to save clip_url:", updateErr.message);
  }

  return NextResponse.json({
    success:  true,
    clip_url: result.videoUrl,
    duration: result.duration,
  });
}
