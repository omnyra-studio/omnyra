/**
 * ElevenLabs service layer — Seedance video, voiceover, merge.
 * FORCED default: seedance-elevenlabs only. No Kling.
 */

import { cleanEnv, supabaseAdmin } from "@/lib/supabase/admin";
import { ENHANCED_CINEMATIC_RE, buildSeedanceElevenLabsPrompt } from "@/lib/motion-prompt";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { writeFileSync, readFileSync, unlinkSync, existsSync, copyFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { execSync } from "child_process";

const BASE_URL = "https://api.elevenlabs.io/v1";
/**
 * Attempted Seedance endpoint — NOT in public OpenAPI as of 2026-06.
 * Official openapi.json only exposes /v1/music/video-to-music for video-related REST.
 * Image & Video (incl. Seedance) is dashboard/UI beta — no public generate route documented.
 * @see https://elevenlabs.io/docs/overview/capabilities/image-video
 */
export const SEEDANCE_GENERATE_URL = `${BASE_URL}/video/seedance/generate`;
const SEEDANCE_POLL_BASE = `${BASE_URL}/video/seedance`;
export const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";

const POLL_INTERVAL_MS = 4_000;
const MAX_POLL_MS = 240_000;
const MP3_BYTES_PER_SECOND = 16_000;

export const SEEDANCE_ELEVENLABS_MODEL = "seedance-elevenlabs";

export type SeedanceMotionLevel = "maximum" | "high" | "medium" | "low";

export interface ElevenLabsSeedanceParams {
  prompt: string;
  duration?: number;
  motion?: SeedanceMotionLevel;
  motionIntensity?: SeedanceMotionLevel;
  aspectRatio?: "9:16" | "16:9" | "1:1";
  imageUrl?: string;
  /** When true, prompt is sent as-is (controller already wrapped ethnicity + motion). */
  rawPrompt?: boolean;
  /** Seedance baked-in audio — always off by default; use elevenLabsVoiceover() + mergeVideoAudio() instead (cheaper). */
  generateAudio?: boolean;
  resolution?: "480p" | "720p" | "1080p";
}

export interface ElevenLabsSeedanceResult {
  videoUrl: string;
  modelUsed: string;
  generationMs: number;
}

export interface ElevenLabsVoiceoverParams {
  text: string;
  voiceId?: string;
  userId?: string;
  jobId?: string;
}

export interface ElevenLabsVoiceoverResult {
  audioUrl: string;
  duration: number;
}

export interface MergeVideoAudioParams {
  videoUrl: string;
  audioUrl: string;
  userId?: string;
}

function getApiKey(): string {
  const key = cleanEnv(process.env.ELEVENLABS_API_KEY);
  if (!key) throw new Error("ELEVENLABS_API_KEY not configured — required for Seedance via ElevenLabs");
  return key;
}

function clampDuration(secs: number | undefined): number {
  if (!secs || secs <= 0) return 6;
  return Math.max(5, Math.min(10, Math.round(secs))); // ElevenLabs accepts 5–10s; 6s is credit-optimal
}

function resolveMotion(params: ElevenLabsSeedanceParams): SeedanceMotionLevel {
  return params.motion ?? params.motionIntensity ?? "high";
}

function resolvePrompt(params: ElevenLabsSeedanceParams): string {
  const trimmed = params.prompt.trim();
  if (params.rawPrompt || ENHANCED_CINEMATIC_RE.test(trimmed)) return trimmed;
  return buildSeedanceElevenLabsPrompt(trimmed);
}

function extractVideoUrl(payload: Record<string, unknown>): string | undefined {
  // ElevenLabs Seedance response: { video_url, status, generation_id }
  // Also handles nested shapes from other providers.
  const candidates = [
    payload.video_url,
    payload.videoUrl,
    payload.url,
    payload.finalUrl,
    (payload.video as Record<string, unknown> | undefined)?.url,
    (payload.data  as Record<string, unknown> | undefined)?.video_url,
    (payload.data  as Record<string, unknown> | undefined)?.url,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("http")) return c;
  }
  return undefined;
}

async function pollSeedanceJob(
  apiKey: string,
  generationId: string,
  startMs: number,
): Promise<string> {
  const deadline = startMs + MAX_POLL_MS;
  const pollUrl = `${SEEDANCE_POLL_BASE}/${generationId}`;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(pollUrl, { headers: { "xi-api-key": apiKey } });
    if (!res.ok) {
      // Transient error — keep polling
      console.warn(`[SEEDANCE_POLL] HTTP ${res.status} — retrying`);
      continue;
    }

    const body = await res.json() as Record<string, unknown>;
    const status = String(body.status ?? body.state ?? "").toLowerCase();
    console.log(`[SEEDANCE_POLL] id=${generationId} status=${status}`);

    if (status === "failed" || status === "error") {
      throw new Error(`Seedance generation failed: ${String(body.error ?? body.message ?? "unknown")}`);
    }

    if (status === "completed" || status === "succeeded" || status === "success") {
      const url = extractVideoUrl(body);
      if (url) return url;
      throw new Error("Seedance completed but returned no video URL");
    }
    // "queued" / "processing" / "generating" — keep polling
  }

  throw new Error("Seedance generation timed out after 4 minutes");
}

/**
 * Generate video with native ElevenLabs Seedance — no fal.ai, no Kling.
 * POST /v1/video/seedance/generate
 */
export async function elevenLabsSeedanceGenerate(
  params: ElevenLabsSeedanceParams,
): Promise<ElevenLabsSeedanceResult> {
  const startMs = Date.now();
  const apiKey = getApiKey();
  const durationSeconds = clampDuration(params.duration);
  const motion = resolveMotion(params);
  const finalPrompt = resolvePrompt(params);
  const generateAudio = params.generateAudio ?? false;
  const resolution = params.resolution ?? "720p";

  const requestBody: Record<string, unknown> = {
    prompt:           finalPrompt,
    duration_seconds: durationSeconds,
    resolution,
    motion_intensity: motion,
    generate_audio:   generateAudio,
  };

  console.log(`[SEEDANCE_ELEVENLABS] POST /video/seedance/generate duration=${durationSeconds}s motion=${motion} generate_audio=${generateAudio} (voiceover via separate TTS) hasImage=${!!params.imageUrl}`);

  const submitRes = await fetch(SEEDANCE_GENERATE_URL, {
    method:  "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body:    JSON.stringify(requestBody),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => "");
    console.error("[SEEDANCE_ELEVENLABS] Error:", submitRes.status, errText.substring(0, 500));

    if (submitRes.status === 404) {
      throw new Error(
        `Seedance failed with status 404: ${SEEDANCE_GENERATE_URL} is not in the ElevenLabs public API. ` +
        `OpenAPI only lists /v1/music/video-to-music — Image & Video (Seedance) is dashboard-only (beta). ` +
        `fal.ai fallback is disabled. Response: ${errText.substring(0, 200)}`,
      );
    }

    throw new Error(`Seedance failed with status ${submitRes.status}: ${errText.substring(0, 300)}`);
  }

  const payload = await submitRes.json() as Record<string, unknown>;
  console.log(`[SEEDANCE_ELEVENLABS_OK] response keys=${Object.keys(payload).join(",")}`);

  let videoUrl = extractVideoUrl(payload);

  if (!videoUrl) {
    const generationId =
      (payload.generation_id as string | undefined) ??
      (payload.id as string | undefined) ??
      (payload.request_id as string | undefined);

    if (!generationId) {
      throw new Error(`Seedance returned no video_url or generation_id — ${JSON.stringify(payload).substring(0, 200)}`);
    }

    console.log(`[SEEDANCE_POLL_START] id=${generationId}`);
    videoUrl = await pollSeedanceJob(apiKey, generationId, startMs);
  }

  if (!videoUrl) throw new Error("Seedance returned no video");

  const generationMs = Date.now() - startMs;
  console.info(`[SEEDANCE_ELEVENLABS_OK] motion=${motion} ms=${generationMs} url=${videoUrl.substring(0, 80)}`);

  return {
    videoUrl,
    modelUsed: SEEDANCE_ELEVENLABS_MODEL,
    generationMs,
  };
}

export const elevenLabsSeedance = elevenLabsSeedanceGenerate;

/** Strict ElevenLabs-only Seedance entry — no fal.ai, no fallbacks. */
export async function forceElevenLabsSeedance(
  prompt: string,
  options: {
    duration?: number;
    resolution?: "480p" | "720p" | "1080p";
    motionIntensity?: SeedanceMotionLevel;
    generateAudio?: boolean;
    rawPrompt?: boolean;
  } = {},
): Promise<string> {
  console.log("✅ FORCING SEEDANCE VIA ELEVENLABS ONLY");
  const result = await elevenLabsSeedanceGenerate({
    prompt,
    duration:        options.duration ?? 6,
    resolution:      options.resolution ?? "720p",
    motionIntensity: options.motionIntensity ?? "high",
    generateAudio:   options.generateAudio ?? false,
    rawPrompt:       options.rawPrompt ?? true,
  });
  return result.videoUrl;
}

// ── Ambient sound descriptions that map well to common scene types ────────────
const AMBIENT_SCENE_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /\b(beach|ocean|sea|wave|shore|coastal|surf)\b/i,         description: "ocean waves gently crashing on a sandy beach, distant seagulls" },
  { pattern: /\b(forest|woods|tree|jungle|nature|bird|birdsong)\b/i,   description: "birds chirping in a peaceful forest, gentle wind through leaves" },
  { pattern: /\b(rain|storm|thunder|drizzle|wet|puddle)\b/i,           description: "steady rain falling, droplets on glass, distant thunder" },
  { pattern: /\b(city|street|urban|traffic|car|vehicle|driving)\b/i,   description: "busy city street ambience, cars passing, distant traffic hum" },
  { pattern: /\b(cafe|coffee|restaurant|diner|indoor)\b/i,             description: "cozy cafe ambience, soft chatter, coffee machine, quiet background" },
  { pattern: /\b(night|evening|dark|moon|star|quiet)\b/i,              description: "quiet night ambience, distant crickets, soft breeze" },
  { pattern: /\b(gym|workout|exercise|fitness|training)\b/i,           description: "gym ambience, weights clinking, energetic background hum" },
  { pattern: /\b(fire|fireplace|campfire|cozy|warm|flame)\b/i,         description: "crackling fireplace, wood burning, warm cozy ambience" },
  { pattern: /\b(mountain|valley|wind|peak|outdoor|hike)\b/i,          description: "mountain wind, open outdoor atmosphere, distant birds" },
  { pattern: /\b(market|crowd|people|festival|busy)\b/i,               description: "outdoor market ambience, crowd murmur, distant music" },
];

/**
 * Pick an ambient sound description from the scene prompt.
 * Returns null if no pattern matches (no ambient added).
 */
export function pickAmbientDescription(scenePrompt: string): string | null {
  for (const { pattern, description } of AMBIENT_SCENE_PATTERNS) {
    if (pattern.test(scenePrompt)) return description;
  }
  return null;
}

/**
 * Generate ambient background audio via ElevenLabs Sound Effects API.
 * Returns raw audio bytes (MP3).
 */
export async function generateAmbientSound(description: string, durationSeconds = 30): Promise<Buffer> {
  const apiKey = getApiKey();
  const clampedDuration = Math.max(5, Math.min(30, durationSeconds));

  console.log(`[AMBIENT] generating "${description.substring(0, 60)}" duration=${clampedDuration}s`);

  const res = await fetch(`${BASE_URL}/sound-generation`, {
    method:  "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      text:             description,
      duration_seconds: clampedDuration,
      prompt_influence: 0.3,  // 0 = more random/creative, 1 = strict to prompt
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`ElevenLabs sound-generation HTTP ${res.status}: ${errText.substring(0, 200)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new Error("ElevenLabs returned empty ambient audio");
  console.log(`[AMBIENT] generated ${buf.length} bytes`);
  return buf;
}

/** Direct ElevenLabs TTS — uploads MP3 to Supabase and returns public URL. */
export async function elevenLabsVoiceover(
  params: ElevenLabsVoiceoverParams,
): Promise<ElevenLabsVoiceoverResult> {
  const apiKey = getApiKey();
  const voiceId = params.voiceId ?? DEFAULT_VOICE_ID;
  const text = params.text.trim();
  if (!text) throw new Error("Voiceover text is required");

  const res = await fetch(`${BASE_URL}/text-to-speech/${voiceId}`, {
    method:  "POST",
    headers: {
      "xi-api-key":   apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability:         0.35,
        similarity_boost:  0.75,
        style:             0.65,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS HTTP ${res.status}: ${errText.substring(0, 200)}`);
  }

  const audioBuffer = Buffer.from(await res.arrayBuffer());
  if (audioBuffer.length < 1000) {
    throw new Error("ElevenLabs returned an empty audio file");
  }

  const userId = params.userId ?? "anonymous";
  const storagePath = `voice/${userId}/${Date.now()}.mp3`;
  const { data, error } = await supabaseAdmin.storage
    .from("renders")
    .upload(storagePath, audioBuffer, { contentType: "audio/mpeg", upsert: true });

  if (error) throw new Error(`Voiceover upload failed: ${error.message}`);

  const { data: { publicUrl } } = supabaseAdmin.storage.from("renders").getPublicUrl(data.path);
  const duration = Math.round((audioBuffer.length / MP3_BYTES_PER_SECOND) * 10) / 10;

  return { audioUrl: publicUrl, duration };
}

function resolveFfmpegPath(): void {
  const tmp = "/tmp/ffmpeg_elevenlabs_merge";
  if (ffmpegStatic && process.platform === "linux") {
    try {
      if (!existsSync(tmp)) {
        copyFileSync(ffmpegStatic, tmp);
        execSync(`chmod 755 "${tmp}"`);
      }
      ffmpeg.setFfmpegPath(tmp);
      return;
    } catch { /* fall through */ }
  }
  if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);
}

async function fetchMediaBuffer(url: string, label: string): Promise<Buffer> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${label} fetch HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error(`${label} returned 0 bytes`);
  return buf;
}

/** Merge video + voiceover via FFmpeg, upload to Supabase `renders` bucket. */
export async function mergeVideoAudio(params: MergeVideoAudioParams): Promise<string> {
  const userId = params.userId ?? "anonymous";
  const id = randomUUID();
  const videoPath  = join(tmpdir(), `merge-v-${id}.mp4`);
  const audioPath  = join(tmpdir(), `merge-a-${id}.mp3`);
  const outputPath = join(tmpdir(), `merge-out-${id}.mp4`);

  try {
    resolveFfmpegPath();

    const [videoBuf, audioBuf] = await Promise.all([
      fetchMediaBuffer(params.videoUrl, "video"),
      fetchMediaBuffer(params.audioUrl, "audio"),
    ]);
    writeFileSync(videoPath, videoBuf);
    writeFileSync(audioPath, audioBuf);

    // Loop video so full voiceover plays when narration is longer than the clip.
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .inputOptions(["-stream_loop", "-1"])
        .input(audioPath)
        .outputOptions([
          "-c:v", "libx264",
          "-preset", "fast",
          "-crf", "23",
          "-c:a", "aac",
          "-b:a", "192k",
          "-map", "0:v:0",
          "-map", "1:a:0",
          "-shortest",
          "-movflags", "+faststart",
        ])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(new Error(`FFmpeg: ${err.message}`)))
        .run();
    });

    if (!existsSync(outputPath)) throw new Error("FFmpeg produced no output file");

    const buffer = readFileSync(outputPath);
    if (!buffer.length) throw new Error("FFmpeg produced empty output");

    const storagePath = `final/${Date.now()}.mp4`;

    const { data, error } = await supabaseAdmin.storage
      .from("renders")
      .upload(storagePath, buffer, { contentType: "video/mp4", upsert: true });

    if (error) throw new Error(`renders bucket upload: ${error.message}`);

    const { data: { publicUrl } } = supabaseAdmin.storage.from("renders").getPublicUrl(data.path);
    console.log(`[MERGE_OK] bucket=renders path=${storagePath} user=${userId} url=${publicUrl.substring(0, 80)}`);
    return publicUrl;
  } catch (e) {
    console.error("[MERGE] failed — using video only:", e instanceof Error ? e.message : e);
    return params.videoUrl;
  } finally {
    [videoPath, audioPath, outputPath].forEach(p => { try { unlinkSync(p); } catch {} });
  }
}