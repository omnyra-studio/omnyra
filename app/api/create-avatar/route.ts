/**
 * POST /api/create-avatar
 *
 * Creates a HeyGen Instant Avatar from the user's uploaded reference video.
 * Polls until the avatar is ready, then stores heygen_avatar_id in profiles.
 *
 * Flow:
 *   1. Auth + load profile
 *   2. Gate: reference video must exist
 *   3. Short-circuit: if heygen_avatar_id already set, return it immediately
 *   4. POST to HeyGen to start avatar creation
 *   5. Poll until status=completed (max 2.5 min)
 *   6. Persist avatar_id to profiles.heygen_avatar_id
 *   7. Return { success, avatar_id }
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// Avatar creation can take up to ~2 minutes on HeyGen's side.
// This route polls synchronously, so maxDuration must exceed that.
export const maxDuration = 300;

const HEYGEN_BASE = "https://api.heygen.com";
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 30; // 30 × 5s = 2.5 minutes

// ── HeyGen helpers ────────────────────────────────────────────────────────────

async function heygenPost(path: string, body: unknown): Promise<Response> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) throw new Error("HEYGEN_API_KEY is not configured");

  return fetch(`${HEYGEN_BASE}${path}`, {
    method: "POST",
    headers: {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function heygenGet(path: string): Promise<Response> {
  const apiKey = process.env.HEYGEN_API_KEY!;
  return fetch(`${HEYGEN_BASE}${path}`, {
    headers: { "X-Api-Key": apiKey },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  void request; // body unused — all data comes from the authenticated profile

  // ── Auth ─────────────────────────────────────────────────────────────────────
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

  // ── Load profile ─────────────────────────────────────────────────────────────
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("avatar_reference_video_url, heygen_avatar_id")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // ── Gate: reference video required ───────────────────────────────────────────
  if (!profile.avatar_reference_video_url) {
    return NextResponse.json(
      { error: "Upload a reference video first. Go to Settings → Avatar." },
      { status: 400 },
    );
  }

  // ── Short-circuit: avatar already exists ─────────────────────────────────────
  if (profile.heygen_avatar_id) {
    console.log(`[create-avatar] user ${user.id} already has avatar ${profile.heygen_avatar_id}`);
    return NextResponse.json({
      success: true,
      avatar_id: profile.heygen_avatar_id,
      message: "Avatar already exists",
    });
  }

  // ── Submit avatar creation to HeyGen ─────────────────────────────────────────
  console.log(`[create-avatar] Submitting avatar creation for user ${user.id}`);

  let createRes: Response;
  try {
    createRes = await heygenPost("/v2/avatars", {
      name: `user_avatar_${user.id}`,
      video_url: profile.avatar_reference_video_url,
      motion_extraction: {
        capture_micro_expressions: true,
        capture_gestures:          true,
        capture_posture_shifts:    true,
        motion_variance:           0.7,
      },
    });
  } catch (err) {
    console.error("[create-avatar] HeyGen POST failed:", err);
    return NextResponse.json(
      { error: "Could not reach HeyGen. Try again in a moment." },
      { status: 502 },
    );
  }

  const createData = await createRes.json() as {
    data?: { avatar_id?: string };
    error?: { message?: string };
  };

  if (!createRes.ok || !createData.data?.avatar_id) {
    const msg = createData.error?.message ?? `HeyGen API error ${createRes.status}`;
    console.error("[create-avatar] HeyGen creation error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const pendingAvatarId = createData.data.avatar_id;
  console.log(`[create-avatar] HeyGen job started — polling avatar ${pendingAvatarId}`);

  // ── Poll until ready ──────────────────────────────────────────────────────────
  let finalAvatarId: string | null = null;

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    let pollRes: Response;
    try {
      pollRes = await heygenGet(`/v2/avatars/${pendingAvatarId}`);
    } catch (err) {
      console.warn(`[create-avatar] Poll attempt ${attempt} failed (network):`, err);
      continue;
    }

    const pollData = await pollRes.json() as {
      data?: { status?: string; avatar_id?: string; error?: string };
    };

    const status = pollData.data?.status;
    console.log(`[create-avatar] Poll ${attempt}/${MAX_POLL_ATTEMPTS} — status: ${status}`);

    if (status === "completed") {
      // HeyGen may return a different (final) avatar_id once processing is done
      finalAvatarId = pollData.data?.avatar_id ?? pendingAvatarId;
      break;
    }

    if (status === "failed") {
      const errMsg = pollData.data?.error ?? "Avatar creation failed on HeyGen's side";
      console.error("[create-avatar] HeyGen avatar failed:", errMsg);
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }
  }

  if (!finalAvatarId) {
    console.error(`[create-avatar] Timed out after ${MAX_POLL_ATTEMPTS} polls`);
    return NextResponse.json(
      { error: "Avatar creation timed out. HeyGen is taking longer than usual — try again." },
      { status: 504 },
    );
  }

  // ── Persist to profile ────────────────────────────────────────────────────────
  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ heygen_avatar_id: finalAvatarId })
    .eq("id", user.id);

  if (updateErr) {
    // Avatar was created but we couldn't save the ID. Log it so it can be recovered.
    console.error(
      `[create-avatar] IMPORTANT — avatar created (${finalAvatarId}) but DB update failed:`,
      updateErr.message,
    );
    // Still return success — the avatar exists on HeyGen's side
  }

  console.log(`[create-avatar] Done — user ${user.id} → avatar ${finalAvatarId}`);

  return NextResponse.json({
    success: true,
    avatar_id: finalAvatarId,
    message: "Avatar created successfully",
  });
}
