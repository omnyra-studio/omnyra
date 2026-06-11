// ElevenLabs TTS workers for the parallel orchestration engine.
//
// Two modes:
//   generateSceneAudio  — per-shot TTS used by Hedra avatar lane (one call per shot)
//   generateVoiceover   — full-script single voiceover for the complete video (fires at T=0)
//
// Pattern mirrors lib/workers/voiceover-worker.ts but scoped to the parallel engine.

import { createClient }       from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanEnv }            from "@/lib/supabase/admin";

const DEFAULT_VOICE_ID      = "9BWtsMINqrJLrRacOk9x"; // ElevenLabs "Aria" (per-scene TTS)
const DEFAULT_VO_VOICE_ID   = "EXAVITQu4vr4xnSDxMaO"; // "Bella" — richer voiceover tone
const MP3_BYTES_PER_SECOND  = 16_000;                  // 128kbps baseline
const EL_MODEL              = "eleven_multilingual_v2";
const EL_FLASH_V2_5         = "eleven_flash_v2_5";    // fastest ElevenLabs model — 32ms latency

export interface SceneTTSInput {
  text:       string;   // narration_text || audio_intent
  voiceId?:   string;   // override default voice
  stability?:         number;
  similarityBoost?:   number;
  style?:             number;
  speed?:             number;
}

export interface SceneTTSResult {
  audio_url:        string;
  duration_seconds: number;
}

export async function generateSceneAudio(
  input:    SceneTTSInput,
  userId:   string,
  shotId:   string,
): Promise<SceneTTSResult> {
  const apiKey = cleanEnv(process.env.ELEVENLABS_API_KEY);
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured");

  const voiceId = input.voiceId ?? DEFAULT_VOICE_ID;
  const text    = input.text.trim();
  if (!text) throw new Error(`Shot ${shotId}: no narration text to synthesise`);

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method:  "POST",
      headers: {
        "xi-api-key":   apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: EL_FLASH_V2_5,
        voice_settings: {
          stability:       input.stability       ?? 0.35,
          similarity_boost: input.similarityBoost ?? 0.75,
          style:           input.style           ?? 0.65,
          use_speaker_boost: true,
          speed:           input.speed           ?? 1.05,
        },
      }),
    },
  );

  if (!res.ok) {
    let detail = `ElevenLabs error ${res.status}`;
    try {
      const err = await res.json() as { detail?: { message?: string } | string };
      if (typeof err.detail === "string") detail = err.detail;
      else if (err.detail?.message)       detail = err.detail.message;
    } catch { /* ignore parse error */ }
    throw new Error(`ElevenLabs TTS shot=${shotId}: ${detail}`);
  }

  const audioBuffer = await res.arrayBuffer();
  if (audioBuffer.byteLength < 1000) {
    throw new Error(`ElevenLabs TTS shot=${shotId}: returned empty audio file`);
  }

  const durationSeconds = Math.round((audioBuffer.byteLength / MP3_BYTES_PER_SECOND) * 10) / 10;

  // Upload to Supabase storage
  const supabase    = createClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
    cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)!,
  );
  const storagePath = `voiceovers/${userId}/shots/${shotId}-${Date.now()}.mp3`;

  const { error: uploadErr } = await supabase.storage
    .from("videos")
    .upload(storagePath, audioBuffer, { contentType: "audio/mpeg", upsert: true });

  if (uploadErr) throw new Error(`ElevenLabs upload shot=${shotId}: ${uploadErr.message}`);

  const { data: { publicUrl } } = supabase.storage.from("videos").getPublicUrl(storagePath);

  return { audio_url: publicUrl, duration_seconds: durationSeconds };
}

// ── Full-video voiceover ───────────────────────────────────────────────────────
// Generates a single MP3 covering the entire script, paced to match targetSecs.
// Fire at T=0 alongside clip generation — resolves in ~2–4s.

export interface VoiceoverInput {
  script:             string;
  voiceId?:           string;
  targetDurationSecs: number;
  speedMode?:         string;  // controls word cap: ultra-draft=22w, draft=35w, balanced=75w, quality=85w
}

export interface VoiceoverResult {
  audioUrl:    string;
  duration:    number;   // target duration (seconds)
  scriptUsed:  string;   // paced script that was actually sent
}

function adjustScriptToDuration(script: string, targetSecs: number = 30): string {
  if (!script?.trim()) return "";

  const cleanScript = script.trim().replace(/\s+/g, " ");
  const wordCount   = cleanScript.split(/\s+/).length;

  console.info(`[VOICEOVER] Input words: ${wordCount}, Target: ${targetSecs}s`);

  // Extremely generous threshold — ~155 words safe zone for a 30s video
  const generousThreshold = Math.floor(targetSecs * 3.5) + 50;

  if (wordCount <= generousThreshold) {
    console.info("[VOICEOVER] ✅ Keeping FULL original script");
    return cleanScript;
  }

  // Only truncate if the script is truly massive
  console.warn(`[VOICEOVER] Script too long (${wordCount} words), smart truncating...`);

  const sentences   = cleanScript.match(/[^.!?]+[.!?]+/g) ?? [cleanScript];
  const targetWords = Math.floor(targetSecs * 2.9);
  let result        = "";
  let currentWords  = 0;

  for (const sentence of sentences) {
    const sentWords = sentence.trim().split(/\s+/).length;
    if (currentWords + sentWords <= targetWords + 40) {
      result       += sentence + " ";
      currentWords += sentWords;
    } else {
      break;
    }
  }

  const final = result.trim() || cleanScript.split(/\s+/).slice(0, targetWords).join(" ") + ".";
  console.info(`[VOICEOVER] Final output words: ${final.split(/\s+/).length}`);
  return final;
}

// ── Chunked voiceover ─────────────────────────────────────────────────────────
// Splits long scripts into 85-word chunks so the turbo model never silently
// truncates. Each chunk is generated independently then stitched with FFmpeg.

const CHUNK_SIZE = 30; // words — 30-word chunks ~10-11s each, prevents silent turbo truncation

function splitScriptIntoChunks(script: string, maxWords: number = CHUNK_SIZE): string[] {
  const words   = script.split(" ");
  const chunks: string[] = [];
  let current   = "";
  let count     = 0;

  for (const word of words) {
    current += (current ? " " : "") + word;
    count++;
    if (count >= maxWords) {
      chunks.push(current.trim());
      current = "";
      count   = 0;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function callElevenLabs(
  text:   string,
  voice:  string,
  apiKey: string,
): Promise<ArrayBuffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream`, {
    method:  "POST",
    headers: {
      "Accept":       "audio/mpeg",
      "Content-Type": "application/json",
      "xi-api-key":   apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: EL_FLASH_V2_5,
      voice_settings: { stability: 0.8, similarity_boost: 0.85, speed: 1.05 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[ELEVENLABS ERROR]", res.status, errText);
    throw new Error(`ElevenLabs chunk failed: ${res.status}`);
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength < 500) throw new Error("ElevenLabs returned empty audio chunk");
  return buf;
}

function makeSupabase() {
  return createClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
    cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)!,
  );
}

async function uploadChunk(buf: ArrayBuffer, storagePath: string): Promise<string> {
  const sb = makeSupabase();
  const { error } = await sb.storage
    .from("videos")
    .upload(storagePath, buf, { contentType: "audio/mpeg", upsert: true });
  if (error) throw new Error(`[voiceover] upload failed: ${error.message}`);
  return sb.storage.from("videos").getPublicUrl(storagePath).data.publicUrl;
}

async function probeLocalDuration(filePath: string): Promise<number> {
  const ffmpeg       = (await import("fluent-ffmpeg")).default;
  const ffmpegStatic = (await import("ffmpeg-static")).default;
  if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);
  return new Promise(resolve => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) { console.warn("[probeLocalDuration] ffprobe error:", err.message); resolve(0); return; }
      const dur = meta?.format?.duration ?? 0;
      resolve(typeof dur === "number" ? dur : parseFloat(String(dur)) || 0);
    });
  });
}

async function stitchAudioChunks(
  chunkUrls: string[],
  userId:    string,
  planId:    string,
): Promise<{ url: string; durationSecs: number }> {
  // Lazy-import node modules (server-side only)
  const ffmpeg        = (await import("fluent-ffmpeg")).default;
  const ffmpegStatic  = (await import("ffmpeg-static")).default;
  const fs            = await import("node:fs");
  const path          = await import("node:path");
  const os            = await import("node:os");
  const https         = await import("node:https");
  const http          = await import("node:http");
  const { randomUUID } = await import("node:crypto");

  if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

  const workDir = path.join(os.tmpdir(), "omnyra_vo_stitch");
  if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });

  // Download each chunk to a local file
  const localPaths: string[] = [];
  for (let i = 0; i < chunkUrls.length; i++) {
    const dest = path.join(workDir, `vo_chunk_${i}_${randomUUID()}.mp3`);
    await new Promise<void>((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      const get  = chunkUrls[i].startsWith("https://") ? https.get : http.get;
      get(chunkUrls[i], res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          // Follow redirect by re-calling (simple one-level follow)
          const redir = chunkUrls[i] = res.headers.location!;
          const g2 = redir.startsWith("https://") ? https.get : http.get;
          g2(redir, r2 => { r2.pipe(file); file.on("finish", () => file.close(() => resolve())); })
            .on("error", reject);
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
      }).on("error", reject);
    });
    localPaths.push(dest);
  }

  // Write FFmpeg concat list
  const listPath  = path.join(workDir, `concat_${randomUUID()}.txt`);
  const outputPath = path.join(workDir, `stitched_${randomUUID()}.mp3`);
  fs.writeFileSync(listPath, localPaths.map(p => `file '${p}'`).join("\n"));

  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(["-f concat", "-safe 0"])
      .audioCodec("libmp3lame")
      .audioBitrate("192k")
      .output(outputPath)
      .on("error", reject)
      .on("end", () => resolve())
      .run();
  });

  // Probe real duration before upload/cleanup
  const durationSecs = await probeLocalDuration(outputPath);
  console.info(`[STITCHER_AUDIO] stitched duration probed: ${durationSecs.toFixed(2)}s`);

  // Upload stitched file
  const stitchedBuf  = fs.readFileSync(outputPath);
  const storagePath  = `voiceovers/${userId}/plans/${planId}-stitched-${Date.now()}.mp3`;
  const finalUrl     = await uploadChunk(stitchedBuf.buffer, storagePath);

  // Cleanup
  [...localPaths, listPath, outputPath].forEach(p => { try { fs.unlinkSync(p); } catch { /* noop */ } });

  return { url: finalUrl, durationSecs };
}

// Scripts at or below this threshold are sent as a single unbroken TTS call.
// Chunking + FFmpeg stitch introduces micro-gaps and is wasteful for short scripts.
const SHORT_SCRIPT_WORDS = 120;

async function singleCallVoiceover(
  cleanScript: string,
  voiceId:     string,
  apiKey:      string,
  userId:      string,
  planId:      string,
  voiceT0:     number,
  targetSecs:  number,
): Promise<VoiceoverResult> {
  const buf = await callElevenLabs(cleanScript, voiceId, apiKey);

  const storagePath = `voiceovers/${userId}/plans/${planId}-full-${Date.now()}.mp3`;
  const audioUrl    = await uploadChunk(buf, storagePath);

  const fsM         = await import("node:fs");
  const pathM       = await import("node:path");
  const osM         = await import("node:os");
  const { randomUUID } = await import("node:crypto");
  const workDir     = pathM.join(osM.tmpdir(), "omnyra_vo_stitch");
  if (!fsM.existsSync(workDir)) fsM.mkdirSync(workDir, { recursive: true });
  const tempPath    = pathM.join(workDir, `short_${randomUUID()}.mp3`);
  fsM.writeFileSync(tempPath, Buffer.from(buf));
  const realDuration = await probeLocalDuration(tempPath);
  try { fsM.unlinkSync(tempPath); } catch { /* noop */ }

  console.info(`[VOICE] done totalMs=${Date.now() - voiceT0} duration=${realDuration.toFixed(2)}s target=${targetSecs}s (single-call path)`);
  return { audioUrl, duration: realDuration, scriptUsed: cleanScript };
}

// Word cap by speed mode — keeps voiceover duration predictable and prevents
// ultra-draft from generating long audio that doesn't fit the short clip window.
// 'cinematic' bypasses the cap entirely — full script, ElevenLabs handles it.
const VOICEOVER_WORD_CAP: Record<string, number> = {
  'ultra-draft': 22,   // ~9s — matches Lightning clip duration
  'draft':       35,   // ~14s
  'balanced':    75,   // ~30s — full avatar narration
  'quality':     85,   // ~34s
  'cinematic':   9999, // No cap — cinematic full-script voiceover
};

export async function generateVoiceover(
  input:  VoiceoverInput,
  userId: string,
  planId: string,
): Promise<VoiceoverResult> {
  const rawScript   = input.script?.trim().replace(/\s+/g, " ") ?? "";

  // Apply per-mode word cap before TTS — prevents Lightning from generating
  // a 30s voiceover when the video is only 10-14s.
  const maxWords    = VOICEOVER_WORD_CAP[input.speedMode ?? 'balanced'] ?? 75;
  const rawWords    = rawScript.split(/\s+/).filter(Boolean);
  const cleanScript = rawWords.length > maxWords
    ? rawWords.slice(0, maxWords).join(" ").replace(/[,;.!?]+$/, "") + "."
    : rawScript;
  const wordCount   = cleanScript.split(/\s+/).filter(Boolean).length;

  const voiceT0 = Date.now();
  console.info(`[VOICE] start model=${EL_FLASH_V2_5} words=${wordCount}/${rawWords.length} mode=${input.speedMode ?? 'balanced'} maxWords=${maxWords} target=${input.targetDurationSecs}s`);
  console.info(`[VOICEOVER INPUT] First 150 chars: ${cleanScript.substring(0, 150)}...`);

  if (!cleanScript || wordCount < 3) throw new Error("[voiceover] script is required (min 3 words)");

  const apiKey = cleanEnv(process.env.ELEVENLABS_API_KEY);
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured");

  const voiceId = input.voiceId ?? DEFAULT_VO_VOICE_ID;

  // Short scripts: single API call — no chunking, no FFmpeg stitch, no gap artifacts
  if (wordCount <= SHORT_SCRIPT_WORDS) {
    console.info(`[VOICEOVER] ${wordCount} words ≤ ${SHORT_SCRIPT_WORDS} — sending FULL script as single call, no chunking`);
    return singleCallVoiceover(cleanScript, voiceId, apiKey, userId, planId, voiceT0, input.targetDurationSecs);
  }

  // Long scripts: chunk + stitch to avoid ElevenLabs silent truncation
  const chunks = splitScriptIntoChunks(cleanScript, CHUNK_SIZE);
  console.info(`[ELEVENLABS] ${wordCount} words > ${SHORT_SCRIPT_WORDS} — chunking into ${chunks.length} × ≤${CHUNK_SIZE} words`);

  // Generate chunks sequentially — ElevenLabs rate limits parallel requests
  const chunkData: Array<{ url: string; buf: ArrayBuffer }> = [];
  for (let i = 0; i < chunks.length; i++) {
    console.info(`[ELEVENLABS] Chunk ${i + 1}/${chunks.length} - ${chunks[i].split(" ").length} words`);
    const buf         = await callElevenLabs(chunks[i], voiceId, apiKey);
    const storagePath = `voiceovers/${userId}/plans/${planId}-chunk${i}-${Date.now()}.mp3`;
    const url         = await uploadChunk(buf, storagePath);
    chunkData.push({ url, buf });
  }

  // Stitch — multiple chunks always need FFmpeg concat
  const stitchResult = await stitchAudioChunks(chunkData.map(c => c.url), userId, planId);

  console.info(`[VOICE] done totalMs=${Date.now() - voiceT0} duration=${stitchResult.durationSecs.toFixed(2)}s target=${input.targetDurationSecs}s`);
  return { audioUrl: stitchResult.url, duration: stitchResult.durationSecs, scriptUsed: cleanScript };
}
