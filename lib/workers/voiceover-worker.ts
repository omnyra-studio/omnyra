/**
 * Voiceover worker — generates the master voiceover track for a plan.
 * Core logic extracted from /api/generate-voiceover; no HTTP involved.
 */

import { createClient } from "@supabase/supabase-js";
import type { GenerateVoiceoverJob, WorkerResult } from "./types";
import { emitAndForget } from "@/lib/events/emitter";
import { cleanEnv } from "@/lib/supabase/admin";

const DEFAULT_VOICE_ID     = "9BWtsMINqrJLrRacOk9x";  // ElevenLabs "Aria"
const MP3_BYTES_PER_SECOND = 16_000;                   // 128kbps baseline

export async function processVoiceoverJob(job: GenerateVoiceoverJob): Promise<WorkerResult> {
  const { planId, userId, voiceId: jobVoiceId } = job;

  const supabase = createClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
  );

  // Idempotency — skip if already generated
  const { data: planCheck } = await supabase
    .from("shot_plans")
    .select("voiceover_url")
    .eq("id", planId)
    .single();

  if (planCheck?.voiceover_url) {
    console.log(`[voiceover-worker] plan ${planId} already has voiceover — skipping`);
    return { success: true };
  }

  // ── Signal start ──────────────────────────────────────────────────────────────
  await supabase
    .from("shot_plans")
    .update({ voiceover_status: "generating" })
    .eq("id", planId);

  emitAndForget({ type: "VOICEOVER_STARTED", correlationId: planId, payload: { planId } });

  // ── Load shots ordered by shot_number ────────────────────────────────────────
  const { data: shots, error: shotsErr } = await supabase
    .from("shots")
    .select("shot_number, narration_text, audio_intent")
    .eq("shot_plan_id", planId)
    .order("shot_number", { ascending: true });

  if (shotsErr || !shots?.length) {
    emitAndForget({ type: "VOICEOVER_FAILED", correlationId: planId, payload: { planId, error: "No shots found for this plan" } });
    return { success: false, error: "No shots found for this plan" };
  }

  const parts = shots.map(s => {
    const text = ((s.narration_text as string | null) ?? "").trim();
    return text || ((s.audio_intent as string | null) ?? "").trim();
  }).filter(Boolean);

  if (!parts.length) {
    emitAndForget({ type: "VOICEOVER_FAILED", correlationId: planId, payload: { planId, error: "No narration text found" } });
    return { success: false, error: "No narration text found — regenerate shot plan" };
  }

  const fullNarration = parts.join(" ");

  // ── Resolve voice ID ──────────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("voice_id")
    .eq("id", userId)
    .single();

  const voiceId = jobVoiceId ?? (profile?.voice_id as string | null) ?? DEFAULT_VOICE_ID;

  // ── ElevenLabs TTS ────────────────────────────────────────────────────────────
  if (!process.env.ELEVENLABS_API_KEY) {
    emitAndForget({ type: "VOICEOVER_FAILED", correlationId: planId, payload: { planId, error: "ELEVENLABS_API_KEY not configured" } });
    return { success: false, error: "ELEVENLABS_API_KEY not configured" };
  }

  const ttsRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method:  "POST",
      headers: {
        "xi-api-key":   process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text:     fullNarration,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.35, similarity_boost: 0.75, style: 0.65, use_speaker_boost: true, speed: 1.08 },
      }),
    },
  );

  if (!ttsRes.ok) {
    let detail = `ElevenLabs error ${ttsRes.status}`;
    try {
      const err = await ttsRes.json() as { detail?: { message?: string } | string };
      if (typeof err.detail === "string") detail = err.detail;
      else if (err.detail?.message) detail = err.detail.message;
    } catch { /* ignore */ }
    emitAndForget({ type: "VOICEOVER_FAILED", correlationId: planId, payload: { planId, error: detail } });
    return { success: false, error: detail };
  }

  const audioBuffer = await ttsRes.arrayBuffer();
  if (audioBuffer.byteLength < 1000) {
    emitAndForget({ type: "VOICEOVER_FAILED", correlationId: planId, payload: { planId, error: "ElevenLabs returned an empty audio file" } });
    return { success: false, error: "ElevenLabs returned an empty audio file" };
  }

  const durationSeconds = Math.round((audioBuffer.byteLength / MP3_BYTES_PER_SECOND) * 10) / 10;

  // ── Upload to storage ─────────────────────────────────────────────────────────
  const storagePath = `voiceovers/${userId}/${planId}.mp3`;
  const { error: uploadErr } = await supabase.storage
    .from("videos")
    .upload(storagePath, audioBuffer, { contentType: "audio/mpeg", upsert: true });

  if (uploadErr) {
    emitAndForget({ type: "VOICEOVER_FAILED", correlationId: planId, payload: { planId, error: `Storage upload failed: ${uploadErr.message}` } });
    return { success: false, error: `Storage upload failed: ${uploadErr.message}` };
  }

  const { data: { publicUrl } } = supabase.storage.from("videos").getPublicUrl(storagePath);

  // Verify accessibility
  try {
    const check = await fetch(publicUrl, { method: "HEAD" });
    if (!check.ok) {
      emitAndForget({ type: "VOICEOVER_FAILED", correlationId: planId, payload: { planId, error: `Audio uploaded but URL inaccessible (HTTP ${check.status})` } });
      return { success: false, error: `Audio uploaded but URL inaccessible (HTTP ${check.status})` };
    }
  } catch {
    emitAndForget({ type: "VOICEOVER_FAILED", correlationId: planId, payload: { planId, error: "Audio uploaded but URL check failed" } });
    return { success: false, error: "Audio uploaded but URL check failed" };
  }

  // ── Persist ───────────────────────────────────────────────────────────────────
  await supabase
    .from("shot_plans")
    .update({ voiceover_url: publicUrl, voiceover_duration: durationSeconds, voiceover_status: "ready" })
    .eq("id", planId);

  console.log(`[voiceover-worker] plan ${planId} → ${durationSeconds}s → ${publicUrl}`);

  emitAndForget({
    type:          "VOICEOVER_COMPLETED",
    correlationId: planId,
    payload:       { planId, voiceoverUrl: publicUrl, durationSeconds },
  });

  // ── Check if composition can now proceed ─────────────────────────────────────
  try {
    const { checkAndEnqueueComposition } = await import("./coordinator");
    await checkAndEnqueueComposition(supabase, planId, userId);
  } catch (err) {
    console.warn("[voiceover-worker] coordinator check failed:", err);
  }

  return { success: true };
}
