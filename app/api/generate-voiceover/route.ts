/**
 * POST /api/generate-voiceover
 *
 * Generates a single master voiceover track for an entire shot plan.
 * Concatenates narration_text from all shots in order, calls ElevenLabs TTS,
 * uploads the audio to Supabase Storage, and persists the URL to shot_plans.
 *
 * Credit lifecycle: withCreditState reserves before any API call and
 * auto-refunds on any failure — ElevenLabs errors, upload failures, etc.
 *
 * Body:    { planId: string, voiceId?: string }
 * Returns: { success, audio_url, duration_seconds, word_count, shot_count }
 */

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cleanEnv } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { logUsageEvent } from "@/lib/cache";
import { CREDIT_COSTS } from "@/lib/rules/creditRules";
import { withCreditState, InsufficientCreditsError } from "@/lib/credits/withCreditState";

export const maxDuration = 60;

const DEFAULT_VOICE_ID = "9BWtsMINqrJLrRacOk9x";
const MP3_BYTES_PER_SECOND = 16_000;

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

  // ── Validate ElevenLabs key BEFORE any credit reservation ────────────────────
  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: "ElevenLabs API key not configured" }, { status: 503 });
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
  const narrationParts = shots.map((s) => {
    const text = ((s.narration_text as string | null) ?? "").trim();
    if (text) return text;
    return ((s.audio_intent as string | null) ?? "").trim();
  }).filter(Boolean);

  if (narrationParts.length === 0) {
    return NextResponse.json(
      { error: "No narration text found. Regenerate the shot plan to add narration." },
      { status: 422 },
    );
  }

  const fullNarration = narrationParts.join(" ");
  const wordCount = fullNarration.split(/\s+/).length;

  // ── Determine credit cost ─────────────────────────────────────────────────────
  // ≤75 words ≈ ≤30s → voice_30s; >75 words → voice_60s
  const voiceCreditAction = wordCount <= 75 ? "voice_30s" : "voice_60s";
  const creditCost = CREDIT_COSTS[voiceCreditAction];

  // ── Load user voice preference (read-only, safe before credit reservation) ────
  const { data: profile } = await supabase
    .from("profiles")
    .select("voice_id")
    .eq("id", user.id)
    .single();

  const voiceId = bodyVoiceId ?? (profile?.voice_id as string | null) ?? DEFAULT_VOICE_ID;

  const adminSupabase = createClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
  );

  // ── Credit-protected generation ───────────────────────────────────────────────
  try {
    const { audio_url, duration_seconds } = await withCreditState<{ audio_url: string; duration_seconds: number }>({
      userId: user.id,
      cost:   creditCost,
      run:    async () => {
        // Signal generation starting
        await supabase
          .from("shot_plans")
          .update({ voiceover_status: "generating" })
          .eq("id", planId);

        // ── Call ElevenLabs TTS ───────────────────────────────────────────────
        const ttsRes = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
          {
            method: "POST",
            headers: {
              "xi-api-key": process.env.ELEVENLABS_API_KEY!,
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
          throw new Error(detail);
        }

        const audioBuffer = await ttsRes.arrayBuffer();
        if (audioBuffer.byteLength < 1000) {
          throw new Error("ElevenLabs returned an empty audio file");
        }

        const actualDuration = mp3DurationFromBuffer(audioBuffer.byteLength);
        console.log(
          `[generate-voiceover] audio: ${audioBuffer.byteLength} bytes → ${actualDuration}s ` +
          `(word-count estimate: ${Math.round((wordCount / 2.4) * 10) / 10}s)`,
        );

        // ── Upload to Supabase Storage ─────────────────────────────────────────
        const storagePath = `voiceovers/${user.id}/${planId}.mp3`;
        const { error: uploadErr } = await adminSupabase.storage
          .from("videos")
          .upload(storagePath, audioBuffer, { contentType: "audio/mpeg", upsert: true });

        if (uploadErr) {
          throw new Error(`Storage upload failed: ${uploadErr.message}`);
        }

        const { data: { publicUrl } } = adminSupabase.storage.from("videos").getPublicUrl(storagePath);

        // ── Validate public URL ────────────────────────────────────────────────
        const headCheck = await fetch(publicUrl, { method: "HEAD" });
        if (!headCheck.ok) {
          throw new Error(`Audio uploaded but public URL inaccessible (HTTP ${headCheck.status})`);
        }

        // ── Persist to shot_plans ──────────────────────────────────────────────
        const { error: persistErr } = await supabase
          .from("shot_plans")
          .update({
            voiceover_url:      publicUrl,
            voiceover_duration: actualDuration,
            voiceover_status:   "ready",
          })
          .eq("id", planId);

        if (persistErr) {
          // Persistence failure means the URL is lost — user would need to regenerate.
          // Throw to trigger credit rollback rather than silently charging for unusable output.
          throw new Error(`Voiceover generated but failed to persist to shot plan: ${persistErr.message}`);
        }

        console.log(`[generate-voiceover] plan=${planId} — ${wordCount} words → ${actualDuration}s → ${publicUrl}`);

        return { data: { audio_url: publicUrl, duration_seconds: actualDuration } };
      },
    });

    logUsageEvent(user.id, "generate-voiceover", "generate", creditCost, { planId, wordCount, shotCount: shots.length });

    return NextResponse.json({
      success:          true,
      audio_url,
      duration_seconds,
      word_count:       wordCount,
      shot_count:       shots.length,
    });

  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        {
          error:     "INSUFFICIENT_CREDITS",
          balance:   err.balance,
          required:  err.cost,
          planType:  err.planType,
        },
        { status: 402 },
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-voiceover] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
