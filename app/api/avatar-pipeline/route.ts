/**
 * POST /api/avatar-pipeline
 *
 * Converts a static AI-generated image into a natural-moving talking avatar video.
 *
 * ── Pipeline stages ───────────────────────────────────────────────────────────
 *
 *  1. enhance      — Upscale & sharpen image via fal-ai/clarity-upscaler
 *                    (preserves likeness, boosts resolution for avatar training)
 *
 *  2. animate      — Animate to a 10s reference video via Kling image-to-video
 *                    Prompt forces subtle micro-movements only — no talking, no
 *                    gestures. Gives D-ID a "movement signature" to learn from,
 *                    which is the difference between a stiff photo avatar and a
 *                    naturally moving one.
 *
 *  3. create_actor — POST /clips/actors to D-ID with the reference video URL.
 *                    D-ID captures the face geometry + natural movement range.
 *
 *  4. poll_actor   — Wait for D-ID to finish training the actor (2–5 min).
 *
 *  5. generate_clip — POST /clips with the actor_id and the user's script.
 *                     All motion parameters forced to maximum natural values:
 *                     idle_motion, gesture_intensity, expression_amplification,
 *                     eye variance, slow push-in camera.
 *
 *  6. poll_clip    — Wait for D-ID to render the final talking video (1–2 min).
 *
 * ── Caching ───────────────────────────────────────────────────────────────────
 *
 *  The enhanced image URL, reference video URL, and D-ID actor_id are stored
 *  in `avatar_profiles` keyed by (user_id, source_image_url). Subsequent calls
 *  with the same imageUrl skip stages 1–4 entirely — only the talking video
 *  is regenerated. Pass forceRefresh: true to rebuild the actor.
 *
 * ── Required DB migration ─────────────────────────────────────────────────────
 *
 *  Run this once in Supabase SQL editor:
 *
 *  CREATE TABLE IF NOT EXISTS avatar_profiles (
 *    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *    user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
 *    name                TEXT,
 *    source_image_url    TEXT NOT NULL,
 *    enhanced_image_url  TEXT,
 *    reference_video_url TEXT,
 *    did_actor_id        TEXT,
 *    status              TEXT DEFAULT 'pending',
 *    created_at          TIMESTAMPTZ DEFAULT NOW(),
 *    UNIQUE(user_id, source_image_url)
 *  );
 *  ALTER TABLE avatar_profiles ENABLE ROW LEVEL SECURITY;
 *  CREATE POLICY "Users manage own avatars"
 *    ON avatar_profiles FOR ALL USING (auth.uid() = user_id);
 *
 * ── Env vars ──────────────────────────────────────────────────────────────────
 *
 *  FAL_API_KEY          — fal.ai key (enhance + animate)
 *  DID_API_KEY          — D-ID Basic auth key (base64 email:key)
 *  ELEVENLABS_API_KEY   — voice synthesis
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { requireEnv, requireEnvGroup } from "@/lib/env/validate";

export const maxDuration = 300; // 5 min — actor training takes 2–5 min

// ── Types ─────────────────────────────────────────────────────────────────────

type Stage =
  | "enhance"
  | "animate"
  | "create_actor"
  | "poll_actor"
  | "generate_clip"
  | "poll_clip";

interface PipelineBody {
  script: string;
  voiceId?: string;
  avatarName?: string;
  backgroundImageUrl?: string; // first scene image — used as clip background
  forceRefresh?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DID_BASE = "https://api.d-id.com";

// Subtle natural movement — gives D-ID a movement signature to capture.
// Key: NO talking, no gestures, no dramatic motion. Just biological life.
const ANIMATE_PROMPT =
  "subtle natural head micro-movements, gentle eye blinks, soft breathing, " +
  "slight natural expression shift, life-like human portrait, calm and still, " +
  "ultra realistic, no speaking, no gestures, no dramatic movement";

const ANIMATE_NEGATIVE =
  "talking, mouth moving, speaking, dramatic movement, exaggerated expression, " +
  "gestures, hands, body movement, sudden motion, blur";

// ── Error helper ──────────────────────────────────────────────────────────────

function stageError(stage: Stage, message: string, detail?: string) {
  console.error(`[avatar-pipeline] stage=${stage} error:`, message, detail ?? "");
  return NextResponse.json(
    { success: false, error: message, stage, ...(detail ? { detail } : {}) },
    { status: 500 },
  );
}

// ── D-ID helpers ──────────────────────────────────────────────────────────────

function didHeaders() {
  return {
    "Authorization": `Basic ${requireEnv("DID_API_KEY")}`,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

async function didPost(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${DID_BASE}${path}`, {
    method: "POST",
    headers: didHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    const msg = (data.description ?? data.message ?? `HTTP ${res.status}`) as string;
    throw new Error(msg);
  }
  return data;
}

async function didGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${DID_BASE}${path}`, {
    headers: {
      "Authorization": `Basic ${process.env.DID_API_KEY}`,
      "Accept": "application/json",
    },
  });
  if (!res.ok) throw new Error(`D-ID GET ${path} returned ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

// Polls a getter until isDone or isFailed, with configurable interval + timeout.
async function pollUntil(
  getter: () => Promise<Record<string, unknown>>,
  isDone:   (status: string) => boolean,
  isFailed: (status: string) => boolean,
  intervalMs: number,
  timeoutMs:  number,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const data = await getter();
    const status = data.status as string;
    if (isDone(status))   return data;
    if (isFailed(status)) throw new Error(`Job failed — status: "${status}"`);
    await sleep(intervalMs);
  }
  throw new Error(`Timed out after ${timeoutMs / 1000}s`);
}

// ── fal.ai stages ─────────────────────────────────────────────────────────────

async function enhanceImage(imageUrl: string): Promise<string> {
   
  const result = await (fal as any).subscribe("fal-ai/clarity-upscaler", {
    input: {
      image_url: imageUrl,
      scale: 2,
      prompt: "portrait photo, sharp face, natural skin texture, professional lighting, high resolution, photorealistic",
      creativity: 0.1,   // low — preserve the original likeness
      resemblance: 0.9,  // high — don't drift from source
      detail_boost: true,
    },
    logs: false,
    pollInterval: 3000,
  });

  const url: string | undefined =
    result?.image?.url ??
    result?.data?.image?.url ??
    result?.output?.image?.url;

  if (!url) throw new Error("Clarity upscaler returned no image URL");
  return url;
}

async function animateImage(imageUrl: string): Promise<string> {
   
  const result = await (fal as any).subscribe("fal-ai/kling-video/v2.1/pro/image-to-video", {
    input: {
      image_url: imageUrl,
      prompt: ANIMATE_PROMPT,
      negative_prompt: ANIMATE_NEGATIVE,
      duration: 10,         // 10s gives D-ID enough movement to learn from
      aspect_ratio: "9:16",
      cfg_scale: 0.4,       // low guidance = more subtle, organic motion
    },
    logs: false,
    pollInterval: 5000,
  });

  const url: string | undefined =
    result?.video?.url ??
    result?.data?.video?.url ??
    result?.output?.video?.url;

  if (!url) throw new Error("Kling image-to-video returned no video URL");
  return url;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: PipelineBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { script, voiceId, avatarName, backgroundImageUrl, forceRefresh = false } = body;

  if (!script?.trim()) {
    return NextResponse.json({ success: false, error: "script is required" }, { status: 400 });
  }
  try {
    requireEnvGroup(["DID_API_KEY", "FAL_API_KEY"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 503 });
  }

  fal.config({ credentials: process.env.FAL_API_KEY });

  // ── Require avatar reference video from user profile ──────────────────────
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("avatar_reference_video_url")
    .eq("id", user.id)
    .single();

  if (profileErr) {
    console.error("[avatar-pipeline] profile fetch error:", profileErr.message);
    return NextResponse.json(
      { success: false, error: "Failed to load your profile" },
      { status: 500 },
    );
  }

  const referenceVideoUrl: string | null = profile?.avatar_reference_video_url ?? null;

  if (!referenceVideoUrl) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No avatar reference video found. Upload a short video of yourself (5–30s, clear face, good lighting) to create your avatar.",
        need_upload: true,
        upload_url: "/dashboard/settings#avatar",
      },
      { status: 422 },
    );
  }

  // ── Look up cached D-ID actor for this user's reference video ────────────
  let didActorId: string | null = null;
  let isNewAvatar = false;

  if (!forceRefresh) {
    const { data: cached } = await supabase
      .from("avatar_profiles")
      .select("did_actor_id")
      .eq("user_id", user.id)
      .eq("source_image_url", referenceVideoUrl)
      .eq("status", "ready")
      .maybeSingle();

    if (cached?.did_actor_id) {
      didActorId = cached.did_actor_id;
      console.log(`[avatar-pipeline] Using cached actor: ${didActorId}`);
    }
  }

  // ── Build actor from profile video (if not cached) ────────────────────────
  if (!didActorId) {
    isNewAvatar = true;

    // Stage 3 — Create D-ID actor directly from profile reference video
    // (stages 1 & 2 — image enhance + animate — are skipped because the user
    //  has already uploaded a real reference video of themselves)
    let actorId: string;
    try {
      console.log("[avatar-pipeline] stage=create_actor starting");
      const actorData = await didPost("/clips/actors", {
        name: avatarName ?? `omnyra_${user.id.slice(0, 8)}`,
        source_url: referenceVideoUrl,
      });
      actorId = actorData.id as string;
      if (!actorId) throw new Error("D-ID returned no actor id");
      console.log("[avatar-pipeline] stage=create_actor done:", actorId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return stageError(
        "create_actor",
        `D-ID actor creation failed: ${msg}`,
        "Check that DID_API_KEY is correct and your reference video URL is publicly accessible.",
      );
    }

    // Stage 4 — Poll until actor is ready
    try {
      console.log("[avatar-pipeline] stage=poll_actor waiting…");
      await pollUntil(
        () => didGet(`/clips/actors/${actorId}`),
        (s) => s === "done",
        (s) => s === "error" || s === "failed",
        8_000,
        300_000,
      );
      console.log("[avatar-pipeline] stage=poll_actor ready");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return stageError(
        "poll_actor",
        `D-ID actor processing failed: ${msg}`,
        "Actor training failed. Ensure your reference video shows a clear front-facing shot.",
      );
    }

    didActorId = actorId;

    await supabase.from("avatar_profiles").upsert(
      {
        user_id:             user.id,
        name:                avatarName ?? "My Avatar",
        source_image_url:    referenceVideoUrl, // video URL stored as cache key
        reference_video_url: referenceVideoUrl,
        did_actor_id:        didActorId,
        status:              "ready",
        created_at:          new Date().toISOString(),
      },
      { onConflict: "user_id,source_image_url" },
    );
  }

  // ── Stage 5 — Generate talking clip with forced natural motion ────────────
  let clipId: string;
  try {
    console.log("[avatar-pipeline] stage=generate_clip starting");
    const clipData = await didPost("/clips", {
      actor_id: didActorId,
      script: {
        type: "text",
        input: script.slice(0, 2000), // D-ID hard limit
        ssml: false,
        provider: {
          type: "elevenlabs",
          voice_id: voiceId ?? "JBFqnCBsd6RMkjVDRZzb",
          model_id: "eleven_turbo_v2",
          voice_config: {
            stability:        0.35,  // lower = more expressive
            similarity_boost: 0.80,
            style:            0.65,  // match script emotion
            use_speaker_boost: true,
            speed:            1.05,  // slightly fast — energetic without rushing
          },
        },
      },
      // Force every motion parameter to natural maximum.
      // Motion parameters for Kling avatar animation.
      config: {
        motion_factor: 0.8,   // 0–1: head sway, micro-shifts, natural weight transfer
        sharpen:       true,  // compensates for motion blur
        stitch:        true,  // seamlessly loops idle motion
        fluent:        true,  // smooth audio/video sync
        pad_audio:     0.0,
      },
      background: backgroundImageUrl
        ? { source_url: backgroundImageUrl }
        : { color: "#0a0a0a" },
    });

    clipId = clipData.id as string;
    if (!clipId) throw new Error("D-ID returned no clip id");
    console.log("[avatar-pipeline] stage=generate_clip submitted:", clipId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return stageError(
      "generate_clip",
      `Clip generation failed: ${msg}`,
      "Check that actor_id is valid and the ElevenLabs voice_id exists.",
    );
  }

  // ── Stage 6 — Poll until clip is rendered ─────────────────────────────────
  let finalVideoUrl: string;
  try {
    console.log("[avatar-pipeline] stage=poll_clip waiting…");
    const clipResult = await pollUntil(
      () => didGet(`/clips/${clipId}`),
      (s) => s === "done",
      (s) => s === "error" || s === "rejected",
      5_000,    // poll every 5s
      180_000,  // 3 min max
    );
    finalVideoUrl = clipResult.result_url as string;
    if (!finalVideoUrl) throw new Error("Clip completed but result_url is empty");
    console.log("[avatar-pipeline] stage=poll_clip done:", finalVideoUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return stageError(
      "poll_clip",
      `Clip rendering failed: ${msg}`,
      `Clip ID: ${clipId}. Check D-ID dashboard for details.`,
    );
  }

  return NextResponse.json({
    success:             true,
    video_url:           finalVideoUrl,
    actor_id:            didActorId,
    reference_video_url: referenceVideoUrl,
    is_new_avatar:       isNewAvatar,
  });
}

// ── GET — list user's saved avatar profiles ───────────────────────────────────

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("avatar_profiles")
    .select("id, name, source_image_url, reference_video_url, did_actor_id, status, created_at")
    .eq("user_id", user.id)
    .eq("status", "ready")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, avatars: data ?? [] });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
