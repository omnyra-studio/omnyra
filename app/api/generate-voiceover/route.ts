/**
 * POST /api/generate-voiceover
 *
 * Generates a single master voiceover track for an entire shot plan.
 * Concatenates narration_text from all shots in order, calls ElevenLabs TTS,
 * uploads the audio to Supabase Storage, and persists the URL to shot_plans.
 *
 * Hardening:
 *   - MP3 duration derived from buffer byte size (128 kbps baseline)
 *   - HEAD check verifies public URL is accessible before returning
 *   - ElevenLabs error detail surfaced verbatim for diagnosis
 *
 * Body:    { planId: string, voiceId?: string }
 * Returns: { success, audio_url, duration_seconds, word_count, shot_count }
 */

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { logUsageEvent } from "@/lib/cache";

export const maxDuration = 60;

// Default voice: ElevenLabs "Aria" — neutral, clear, works for all content types
const DEFAULT_VOICE_ID = "9BWtsMINqrJLrRacOk9x";

// ElevenLabs outputs MP3 at ~128 kbps → 16 000 bytes / second
const MP3_BYTES_PER_SECOND = 16_000;

/** Derive actual MP3 duration from byte count at assumed bitrate. */
function mp3DurationFromBuffer(byteLength: number): number {
  return Math.round((byteLength / MP3_BYTES_PER_SECOND) * 10) / 10;
}

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

  let body: { planId?: string; voiceId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { planId, voiceId: bodyVoiceId } = body;
  if (!planId?.trim()) {
    return NextResponse.json({ error: "Missing required field: planId" }, { status: 400 });
  }

  // ── Verify ownership ─────────────────────────────────────────────────────────
  const { data: plan, error: planErr } = await supabase
    .from("shot_plans")
    .select("id, project_id, projects!inner(user_id)")
    .eq("id", planId)
    .single();

  if (planErr || !plan) {
    return NextResponse.json({ error: "Shot plan not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((plan as any).projects?.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Load shots ordered by shot_number ────────────────────────────────────────
  const { data: shots, error: shotsErr } = await supabase
    .from("shots")
    .select("shot_number, narration_text, audio_intent, content_type, duration_seconds, start_time, end_time")
    .eq("shot_plan_id", planId)
    .order("shot_number", { ascending: true });

  if (shotsErr || !shots?.length) {
    return NextResponse.json({ error: "No shots found for this plan" }, { status: 404 });
  }

  // ── Build master narration script ─────────────────────────────────────────────
  // Prefer narration_text; fall back to audio_intent for older shots without it
  const narrationParts = shots.map((s) => {
    const text = ((s.narration_text as string | null) ?? "").trim();
    if (text) return text;
    const intent = ((s.audio_intent as string | null) ?? "").trim();
    return intent;
  }).filter(Boolean);

  if (narrationParts.length === 0) {
    return NextResponse.json(
      { error: "No narration text found. Regenerate the shot plan to add narration." },
      { status: 422 },
    );
  }

  const fullNarration = narrationParts.join(" ");
  const wordCount = fullNarration.split(/\s+/).length;

  // ── Load user's voice preference ─────────────────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("voice_id")
    .eq("id", user.id)
    .single();

  const voiceId = bodyVoiceId ?? (profile?.voice_id as string | null) ?? DEFAULT_VOICE_ID;

  // ── Signal voiceover generation starting (triggers VOICEOVER_STARTED event) ──
  await supabase
    .from("shot_plans")
    .update({ voiceover_status: "generating" })
    .eq("id", planId);

  // ── Validate ElevenLabs key ───────────────────────────────────────────────────
  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: "ElevenLabs API key not configured" }, { status: 503 });
  }

  // ── Call ElevenLabs TTS ───────────────────────────────────────────────────────
  const ttsRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: fullNarration,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.35,
          similarity_boost: 0.75,
          style: 0.65,
          use_speaker_boost: true,
          speed: 1.08,
        },
      }),
    },
  );

  if (!ttsRes.ok) {
    let detail = `ElevenLabs TTS error ${ttsRes.status}`;
    try {
      const err = await ttsRes.json() as { detail?: { message?: string } | string };
      if (typeof err.detail === "string") detail = err.detail;
      else if (err.detail?.message) detail = err.detail.message;
    } catch { /* ignore */ }
    console.error("[generate-voiceover] ElevenLabs error:", detail);
    return NextResponse.json({ error: detail }, { status: 502 });
  }

  const audioBuffer = await ttsRes.arrayBuffer();

  if (audioBuffer.byteLength < 1000) {
    return NextResponse.json({ error: "ElevenLabs returned an empty audio file" }, { status: 502 });
  }

  // ── Derive actual duration from buffer size ───────────────────────────────────
  const actualDuration = mp3DurationFromBuffer(audioBuffer.byteLength);
  console.log(
    `[generate-voiceover] audio: ${audioBuffer.byteLength} bytes → ${actualDuration}s ` +
    `(word-count estimate: ${Math.round((wordCount / 2.4) * 10) / 10}s)`,
  );

  // ── Upload to Supabase Storage ────────────────────────────────────────────────
  const storagePath = `voiceovers/${user.id}/${planId}.mp3`;

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error: uploadErr } = await adminSupabase.storage
    .from("videos")
    .upload(storagePath, audioBuffer, {
      contentType: "audio/mpeg",
      upsert: true,
    });

  if (uploadErr) {
    console.error("[generate-voiceover] Storage upload failed:", uploadErr.message);
    return NextResponse.json({ error: "Audio generated but storage upload failed" }, { status: 500 });
  }

  const { data: { publicUrl } } = adminSupabase.storage.from("videos").getPublicUrl(storagePath);

  // ── Validate public URL is accessible ────────────────────────────────────────
  try {
    const headCheck = await fetch(publicUrl, { method: "HEAD" });
    if (!headCheck.ok) {
      console.error(`[generate-voiceover] Public URL inaccessible: HTTP ${headCheck.status} — ${publicUrl}`);
      return NextResponse.json(
        { error: `Audio uploaded but public URL is inaccessible (HTTP ${headCheck.status}). Check bucket policy.` },
        { status: 500 },
      );
    }
  } catch (err) {
    console.error("[generate-voiceover] URL accessibility check failed:", err);
    return NextResponse.json({ error: "Audio uploaded but URL accessibility check failed" }, { status: 500 });
  }

  // ── Persist voiceover URL and actual duration to shot_plans ──────────────────
  const { error: persistErr } = await supabase
    .from("shot_plans")
    .update({
      voiceover_url:      publicUrl,
      voiceover_duration: actualDuration,
      voiceover_status:   "ready",
    })
    .eq("id", planId);

  if (persistErr) {
    // Non-fatal — return the URL anyway; director page will use it from response
    console.error("[generate-voiceover] Failed to persist voiceover URL to shot_plans:", persistErr.message);
  }

  console.log(`[generate-voiceover] plan=${planId} — ${wordCount} words → ${actualDuration}s → ${publicUrl}`);
  logUsageEvent(user.id, "generate-voiceover", "generate", 3, { planId, wordCount, shotCount: shots.length });

  return NextResponse.json({
    success:          true,
    audio_url:        publicUrl,
    duration_seconds: actualDuration,
    word_count:       wordCount,
    shot_count:       shots.length,
  });
}
