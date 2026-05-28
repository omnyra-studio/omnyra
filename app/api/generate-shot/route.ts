/**
 * POST /api/generate-shot
 *
 * Generates ONE shot and saves the resulting clip URL to the shots table.
 *
 * Routing:
 *   content_type="text_overlay" → fal Flux (sync, fast)
 *   content_type="avatar" + heygenAvatarId set → HeyGen (sync, 30-90s)
 *   everything else → fal.queue.submit() — returns immediately with { status: "queued" }
 *
 * Async path body:  { shotId: string }
 * Async path return: { success: true, status: "queued", fal_request_id: string, shot_db_id: string }
 * Sync path return:  { success: true, clip_url: string, duration: number }
 * Error return:      { error: string }
 *
 * Poll async shots via POST /api/generate-shot/status-batch
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import {
  executeShot,
  augmentPrompt,
  seedanceDuration,
  SEEDANCE_I2V_MODEL,
  SEEDANCE_T2V_MODEL,
} from "@/lib/shot-executor";
import type { ShotPacket } from "@/lib/types/shot";
import type { ShotAssets } from "@/lib/shot-executor";

fal.config({ credentials: process.env.FAL_API_KEY });

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ownerId = (shot as any).shot_plans?.projects?.user_id as string | undefined;
  if (ownerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Load avatar assets ────────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar_reference_video_url, heygen_avatar_id")
    .eq("id", user.id)
    .single();

  const assets: ShotAssets = {
    voiceId,
    voiceText,
    avatarReferenceVideoUrl: profile?.avatar_reference_video_url ?? null,
    heygenAvatarId:          profile?.heygen_avatar_id          ?? null,
  };

  // ── Scene image gate ─────────────────────────────────────────────────────────
  const goingToHeyGen =
    shot.content_type === "avatar" &&
    !!assets.avatarReferenceVideoUrl &&
    !!assets.heygenAvatarId;

  if (!goingToHeyGen && shot.content_type !== "text_overlay" && !shot.scene_image_url) {
    return NextResponse.json(
      { error: `No scene image for shot ${shot.shot_number}. Generate scene images first.` },
      { status: 400 },
    );
  }

  // ── Route decision ────────────────────────────────────────────────────────────
  // text_overlay (Flux) and HeyGen avatar are synchronous; everything else is async fal queue
  const isAsyncFal = !goingToHeyGen && shot.content_type !== "text_overlay";

  // ── Mark as rendering ────────────────────────────────────────────────────────
  await supabase
    .from("shots")
    .update({ render_status: "rendering", render_error: null })
    .eq("shot_id", shotId);

  // ── Async fal path ────────────────────────────────────────────────────────────
  if (isAsyncFal) {
    const model  = shot.scene_image_url ? SEEDANCE_I2V_MODEL : SEEDANCE_T2V_MODEL;
    const prompt = augmentPrompt(shot as ShotPacket);
    const dur    = seedanceDuration(shot.duration_seconds);
    const input  = shot.scene_image_url
      ? { prompt, image_url: shot.scene_image_url, duration: dur, aspect_ratio: "9:16", generate_audio: false }
      : { prompt, duration: dur, aspect_ratio: "9:16", generate_audio: false };

    let falRequestId: string;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const submitted = await (fal as any).queue.submit(model, { input }) as { request_id: string };
      falRequestId = submitted.request_id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "fal queue submit failed";
      console.error(`[generate-shot] async submit failed for shot ${shot.shot_number}:`, msg);
      await supabase
        .from("shots")
        .update({ render_status: "failed", render_error: msg })
        .eq("shot_id", shotId);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    await supabase
      .from("shots")
      .update({ fal_request_id: falRequestId, fal_model: model, render_error: null })
      .eq("shot_id", shotId);

    console.log(`[generate-shot] shot ${shot.shot_number} queued → fal requestId=${falRequestId}`);

    return NextResponse.json({
      success:        true,
      status:         "queued",
      fal_request_id: falRequestId,
      shot_db_id:     shot.id,
      shot_number:    shot.shot_number,
    });
  }

  // ── Sync path (HeyGen or text_overlay) ───────────────────────────────────────
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
