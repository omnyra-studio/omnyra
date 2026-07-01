/**
 * Voice Engine — Layer 3 (timing authority)
 *
 * Generates narration per SceneSkeleton and extracts precise timing.
 * SceneSkeletons CONSTRAIN the voice (what gets said per scene).
 * Voice FINALIZES timing (how long each scene is).
 *
 * The voice engine is the ONLY system allowed to set scene durations.
 * Nothing upstream or downstream may override these timings.
 */

import type { SceneSkeleton, VoiceEngineResult, VoiceTiming } from "./types";

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";

// Voice settings tuned for narration clarity and natural pacing
const VOICE_SETTINGS = {
  stability:          0.45,
  similarity_boost:   0.80,
  style:              0.30,
  use_speaker_boost:  true,
};

// ── Main export ───────────────────────────────────────────────────────────────

export async function runVoiceEngine(
  skeletons:       SceneSkeleton[],
  voiceId:         string,
  userId:          string,
  originalScript?: string,
  targetDuration?: 30 | 60 | 90,
): Promise<VoiceEngineResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");

  // Bug 1 guard: log the exact voiceId entering and leaving this function
  // so any swap between PIPELINE:START and the ElevenLabs call is immediately visible.
  const resolvedId = voiceId || "EXAVITQu4vr4xnSDxMaL";
  console.log(`[VOICE_ENGINE_ID] requested=${voiceId} using=${resolvedId}`);

  // Validate voice exists before generating — fail fast
  await assertVoiceExists(resolvedId, apiKey);

  // Use the original user script when available — Director's narrationBeats are
  // paraphrased for visual pacing and often drop words, producing short audio.
  const rawScript = originalScript?.trim() || skeletons.map(s => s.narrationBeat.trim()).join(" ");

  // Bug 2 guard: trim script to fit targetDuration before hitting ElevenLabs.
  // ~14 chars/sec at natural narration pace. Target 2s below the ceiling so the
  // formula's ~13% underestimate still lands under targetDuration.
  const originalTargetSec = targetDuration ?? 30;
  const targetSec   = originalTargetSec - 1;
  const estimatedSec = rawScript.length / 14.0;
  const maxAllowedSec = targetSec * 1.1;
  let fullScript = rawScript;
  if (estimatedSec > maxAllowedSec) {
    const maxChars = Math.round(targetSec * 14.0);
    fullScript = trimToSentence(rawScript, maxChars);
    console.log(`[DURATION_GUARD] scriptChars=${rawScript.length} estimatedSec=${estimatedSec.toFixed(1)} targetSec=${originalTargetSec} guardTarget=${targetSec} action=trimmed → newChars=${fullScript.length} newEstimatedSec=${(fullScript.length / 14).toFixed(1)}`);
  } else {
    console.log(`[DURATION_GUARD] scriptChars=${rawScript.length} estimatedSec=${estimatedSec.toFixed(1)} targetSec=${originalTargetSec} guardTarget=${targetSec} action=ok`);
  }

  console.log(`[VOICE_ENGINE] generating ${fullScript.length} chars voice=${resolvedId}`);

  // Generate MP3
  const { audioBuffer, durationMs } = await generateAudio(fullScript, resolvedId, apiKey);

  // Upload to Supabase storage
  const audioUrl = await uploadAudio(audioBuffer, userId);

  // Distribute timing proportionally to word count per skeleton
  const timings = distributeTimings(skeletons, durationMs);

  console.log(`[VOICE_ENGINE] done totalDuration=${(durationMs / 1000).toFixed(2)}s scenes=${timings.length}`);

  return {
    audioUrl,
    totalDurationMs: durationMs,
    timings,
  };
}

// ── Voice validation ──────────────────────────────────────────────────────────

async function assertVoiceExists(voiceId: string, apiKey: string): Promise<void> {
  const res = await fetch(`${ELEVENLABS_API}/voices/${voiceId}`, {
    headers: { "xi-api-key": apiKey },
  });

  if (res.status === 404) {
    // Get available voices to report alternatives
    const listRes = await fetch(`${ELEVENLABS_API}/voices`, {
      headers: { "xi-api-key": apiKey },
    });
    const list = listRes.ok ? await listRes.json() : { voices: [] };
    const names = (list.voices ?? []).slice(0, 5).map((v: { name: string }) => v.name).join(", ");
    throw new Error(
      `Voice ID "${voiceId}" not found. Available voices include: ${names || "none — check your ElevenLabs account"}. ` +
      `Update your voice selection to continue.`
    );
  }

  if (!res.ok) {
    throw new Error(`ElevenLabs voice check failed: HTTP ${res.status}`);
  }
}

// ── Audio generation ──────────────────────────────────────────────────────────

async function generateAudio(
  text:    string,
  voiceId: string,
  apiKey:  string,
): Promise<{ audioBuffer: Buffer; durationMs: number }> {
  const res = await fetch(`${ELEVENLABS_API}/text-to-speech/${voiceId}`, {
    method:  "POST",
    headers: {
      "xi-api-key":   apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id:      "eleven_multilingual_v2",
      voice_settings: VOICE_SETTINGS,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs TTS failed: HTTP ${res.status} — ${body.slice(0, 200)}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);

  if (audioBuffer.length < 1000) {
    throw new Error(`ElevenLabs returned suspiciously small audio: ${audioBuffer.length} bytes`);
  }

  // Estimate duration from MP3 bitrate (128kbps = 16 KB/s)
  const durationMs = Math.round((audioBuffer.length / 16_000) * 1000);

  return { audioBuffer, durationMs };
}

// ── Upload ────────────────────────────────────────────────────────────────────

async function uploadAudio(buffer: Buffer, userId: string): Promise<string> {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const filename = `voice/${userId}/${Date.now()}.mp3`;
  const { error } = await supabase.storage
    .from("renders")
    .upload(filename, buffer, {
      contentType: "audio/mpeg",
      upsert:      false,
    });

  if (error) throw new Error(`Audio upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage.from("renders").getPublicUrl(filename);
  if (!urlData?.publicUrl) throw new Error("Could not get public URL for audio");

  return urlData.publicUrl;
}

// ── Timing distribution ───────────────────────────────────────────────────────
// Distributes total voice duration across scenes proportional to word count.
// SceneSkeletons constrain what gets said; voice totalDuration becomes authoritative.

function distributeTimings(
  skeletons:   SceneSkeleton[],
  totalDurationMs: number,
): VoiceTiming[] {
  const wordCounts = skeletons.map(s => countWords(s.narrationBeat));
  const totalWords = wordCounts.reduce((a, b) => a + b, 0) || 1;

  let cumulativeMs = 0;
  const timings: VoiceTiming[] = skeletons.map((s, i) => {
    const ratio      = wordCounts[i] / totalWords;
    const rawDurationMs = Math.round(totalDurationMs * ratio);
    const startMs    = cumulativeMs;
    const endMs      = startMs + rawDurationMs;

    // Detect emotional inflection markers from narration text
    const inflectionMarkers = extractInflectionMarkers(s.narrationBeat, s.emotionalState);

    cumulativeMs = endMs;

    return {
      sceneIndex:        s.index,
      startMs,
      endMs,
      durationMs:        rawDurationMs,
      pauseAfterMs:      i < skeletons.length - 1 ? 200 : 0, // 200ms pause between scenes
      wordCount:         wordCounts[i],
      inflectionMarkers,
    };
  });

  // Correct rounding drift — assign remainder to last scene
  const allocated = timings.reduce((sum, t) => sum + t.durationMs, 0);
  const drift      = totalDurationMs - allocated;
  if (drift !== 0 && timings.length > 0) {
    timings[timings.length - 1].durationMs += drift;
    timings[timings.length - 1].endMs      += drift;
  }

  return timings;
}

function trimToSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const candidate = text.slice(0, maxChars);
  // Find last sentence-ending punctuation
  const lastEnd = Math.max(candidate.lastIndexOf('.'), candidate.lastIndexOf('!'), candidate.lastIndexOf('?'));
  if (lastEnd > maxChars * 0.5) return candidate.slice(0, lastEnd + 1).trim();
  // Fall back to last word boundary
  const lastSpace = candidate.lastIndexOf(' ');
  return (lastSpace > 0 ? candidate.slice(0, lastSpace) : candidate).trim() + '.';
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length || 1;
}

function extractInflectionMarkers(text: string, emotion: string): string[] {
  const markers: string[] = [emotion];
  if (/[.]{3}|[—–]/.test(text))      markers.push("pause");
  if (/\?/.test(text))               markers.push("questioning");
  if (/!/.test(text))                markers.push("emphasis");
  if (/quietly|softly|gently/i.test(text)) markers.push("soft");
  return markers;
}
