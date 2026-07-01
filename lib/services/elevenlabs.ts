/**
 * ElevenLabs service layer — TTS voiceover, ambient audio, FFmpeg merge.
 * Video: Seedance Fast via fal.ai (lib/providers/seedance.ts). TTS stays on ElevenLabs.
 */

import type { EditingPlan, CutType } from "@/lib/cinema/types";
import { cleanEnv, supabaseAdmin } from "@/lib/supabase/admin";
import { ENHANCED_CINEMATIC_RE, buildSeedanceElevenLabsPrompt } from "@/lib/motion-prompt";
import { SEEDANCE_FAL_FAST_MODEL } from "@/lib/providers/seedance";
import { generateVideoByProvider } from "@/lib/providers/video-dispatch";
import { prepareScriptForTts } from "@/lib/utils/strip-visual-directions";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { writeFileSync, readFileSync, unlinkSync, existsSync, copyFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { execSync } from "child_process";

const BASE_URL = "https://api.elevenlabs.io/v1";
export const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
const MP3_BYTES_PER_SECOND = 16_000;

/** Video model slug — Seedance Fast via fal.ai. */
export const SEEDANCE_ELEVENLABS_MODEL = SEEDANCE_FAL_FAST_MODEL;

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
  modelId?: string;
  voiceSettings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
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
  if (!key) throw new Error("ELEVENLABS_API_KEY not configured — required for TTS voiceover");
  return key;
}

function resolvePrompt(params: ElevenLabsSeedanceParams): string {
  const trimmed = params.prompt.trim();
  if (params.rawPrompt || ENHANCED_CINEMATIC_RE.test(trimmed)) return trimmed;
  return buildSeedanceElevenLabsPrompt(trimmed);
}

/** Video via Seedance Fast (fal.ai). Voiceover stays on ElevenLabs TTS. */
export async function elevenLabsSeedanceGenerate(
  params: ElevenLabsSeedanceParams,
): Promise<ElevenLabsSeedanceResult> {
  const finalPrompt = resolvePrompt(params);
  const res = params.resolution === "480p" || params.resolution === "720p" ? params.resolution : "720p";

  const result = await generateVideoByProvider("seedance", {
    prompt:         finalPrompt,
    imageUrl:       params.imageUrl,
    duration:       params.duration ?? 6,
    resolution:     res,
    aspectRatio:    params.aspectRatio ?? "9:16",
    motionStrength: params.motion ?? params.motionIntensity ?? "high",
    generateAudio:  params.generateAudio ?? false,
  });

  return {
    videoUrl:     result.videoUrl,
    modelUsed:    result.modelUsed,
    generationMs: result.generationMs,
  };
}

export const elevenLabsSeedance = elevenLabsSeedanceGenerate;

/** Scene-router entry — Seedance via fal.ai, ElevenLabs TTS separate. */
export async function forceElevenLabsSeedance(
  prompt: string,
  options: {
    duration?: number;
    resolution?: "480p" | "720p" | "1080p";
    motionIntensity?: SeedanceMotionLevel;
    generateAudio?: boolean;
    rawPrompt?: boolean;
    imageUrl?: string | null;
  } = {},
): Promise<string> {
  void options.motionIntensity;
  const result = await elevenLabsSeedanceGenerate({
    prompt,
    duration:      options.duration ?? 6,
    resolution:    options.resolution ?? "720p",
    generateAudio: options.generateAudio ?? false,
    rawPrompt:     options.rawPrompt ?? true,
    imageUrl:      options.imageUrl ?? undefined,
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
  console.log(`[VOICE_ENGINE_ID] requested=${params.voiceId ?? "none"} using=${voiceId}`);
  const text = prepareScriptForTts(params.text.trim());
  if (!text) throw new Error("Voiceover text is required");

  const res = await fetch(`${BASE_URL}/text-to-speech/${voiceId}`, {
    method:  "POST",
    headers: {
      "xi-api-key":   apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: params.modelId ?? "eleven_multilingual_v2",
      voice_settings: {
        stability:         params.voiceSettings?.stability ?? 0.35,
        similarity_boost:  params.voiceSettings?.similarity_boost ?? 0.75,
        style:             params.voiceSettings?.style ?? 0.65,
        use_speaker_boost: params.voiceSettings?.use_speaker_boost ?? true,
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

/**
 * Mix voiceover (from URL) + ambient sound (Buffer already in memory) into one audio track.
 * Ambient is ducked to 20% volume so voice is always intelligible.
 * Returns public URL of the mixed MP3 in Supabase `renders` bucket.
 */
export async function mixVoiceAndAmbient(params: {
  voiceUrl: string;
  ambientBuffer: Buffer;
  userId?: string;
}): Promise<string> {
  const userId = params.userId ?? "anonymous";
  const id = randomUUID();
  const voicePath   = join(tmpdir(), `mix-v-${id}.mp3`);
  const ambientPath = join(tmpdir(), `mix-a-${id}.mp3`);
  const outputPath  = join(tmpdir(), `mix-out-${id}.mp3`);

  try {
    resolveFfmpegPath();

    console.log(`[MIX] downloading voice from ${params.voiceUrl.substring(0, 60)}`);
    const voiceBuf = await fetchMediaBuffer(params.voiceUrl, "voice");
    console.log(`[MIX] voice downloaded ${voiceBuf.length} bytes → ${voicePath}`);
    writeFileSync(voicePath, voiceBuf);

    console.log(`[MIX] writing ambient buffer ${params.ambientBuffer.length} bytes → ${ambientPath}`);
    writeFileSync(ambientPath, params.ambientBuffer);

    console.log(`[MIX] running ffmpeg amix voice+ambient`);
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(voicePath)
        .input(ambientPath)
        .outputOptions([
          "-filter_complex", "[1:a]volume=0.20[amb];[0:a][amb]amix=inputs=2:duration=first:dropout_transition=0[out]",
          "-map", "[out]",
          "-c:a", "libmp3lame",
          "-b:a", "128k",
        ])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => {
          console.error(`[MIX_FFMPEG_ERR] ${err.message}`);
          reject(new Error(`FFmpeg mix: ${err.message}`));
        })
        .run();
    });

    if (!existsSync(outputPath)) throw new Error("FFmpeg mix produced no output file");
    const buffer = readFileSync(outputPath);
    if (!buffer.length) throw new Error("FFmpeg mix produced empty output");

    const storagePath = `voice/${userId}/${Date.now()}-mixed.mp3`;
    const { data, error } = await supabaseAdmin.storage
      .from("renders")
      .upload(storagePath, buffer, { contentType: "audio/mpeg", upsert: true });
    if (error) throw new Error(`Mixed audio upload failed: ${error.message}`);

    const { data: { publicUrl } } = supabaseAdmin.storage.from("renders").getPublicUrl(data.path);
    console.log(`[MIX_OK] voice+ambient url=${publicUrl.substring(0, 80)}`);
    return publicUrl;
  } finally {
    [voicePath, ambientPath, outputPath].forEach(p => { try { unlinkSync(p); } catch {} });
  }
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

    // Merge video + audio — no looping. Audio is trimmed to match video duration.
    const stitchT0 = Date.now();
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions([
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-crf", "23",
          "-threads", "0",
          "-c:a", "aac",
          "-b:a", "128k",
          "-map", "0:v:0",
          "-map", "1:a:0",
          "-movflags", "+faststart",
        ])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(new Error(`FFmpeg: ${err.message}`)))
        .run();
    });
    console.log(`[STITCH_DURATION] elapsed=${Date.now() - stitchT0}ms`);

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

// ── xfade duration (seconds) per CutType ─────────────────────────────────────
const XFADE_S: Record<CutType, number> = {
  'crossfade': 0.8,
  'fade-in':   0.5,
  'fade-out':  0.5,
  'hold':      1.2,
  'l-cut':     0.3,
  'j-cut':     0.3,
  'hard-cut':  0.02,  // imperceptible — effectively a hard cut
  'match-cut': 0.02,
  'smash-cut': 0.02,
};

async function probeDuration(clipPath: string): Promise<number> {
  return new Promise(resolve => {
    ffmpeg.ffprobe(clipPath, (err, data) => {
      if (err || typeof data?.format?.duration !== 'number') {
        console.warn('[PROBE_DURATION_FALLBACK] using 10s default for', clipPath.split('/').pop());
        resolve(10); // fallback: assume 10s Runway clips
      } else {
        const d = data.format.duration as number;
        console.info('[PROBE_DURATION]', clipPath.split('/').pop(), `${d}s`);
        resolve(d);
      }
    });
  });
}

async function runXfadeStitch(params: {
  clipPaths:   string[];
  editingPlan: EditingPlan;
  audioPath:   string | null;
  maxDuration: number;
  finalPath:   string;
}): Promise<void> {
  const { clipPaths, editingPlan, audioPath, maxDuration, finalPath } = params;
  const durations = await Promise.all(clipPaths.map(probeDuration));

  const instructions = editingPlan.instructions.filter(i => i.toBeatIndex !== null);

  // Build xfade filter_complex chain
  let filterStr = '';
  let prevLabel = '[0:v]';
  let cumulativeOffset = 0;

  for (let i = 0; i < clipPaths.length - 1; i++) {
    const inst       = instructions.find(x => x.fromBeatIndex === i);
    const xfadeSec   = inst ? (XFADE_S[inst.cutType] ?? 0.02) : 0.02;
    const outLabel   = `xf${i}`;
    cumulativeOffset += durations[i] - xfadeSec;
    filterStr += `${prevLabel}[${i + 1}:v]xfade=transition=fade:duration=${xfadeSec}:offset=${cumulativeOffset.toFixed(3)}[${outLabel}];`;
    prevLabel = `[${outLabel}]`;
  }

  // Opening/closing video fades on the final chained output
  const openD = (editingPlan.openingFadeMs / 1000).toFixed(2);
  const closeD = (editingPlan.closingFadeMs / 1000).toFixed(2);
  const fadeOut = Math.max(0, maxDuration - editingPlan.closingFadeMs / 1000).toFixed(2);
  filterStr += `${prevLabel}fade=t=in:st=0:d=${openD},fade=t=out:st=${fadeOut}:d=${closeD}[vout]`;

  await new Promise<void>((resolve, reject) => {
    let cmd = ffmpeg();
    clipPaths.forEach(p => { cmd = cmd.input(p); });
    if (audioPath) cmd = cmd.input(audioPath);

    const outputOpts = [
      '-filter_complex', filterStr,
      '-map', '[vout]',
      '-c:v', 'libx264',
      '-preset', 'slow',
      '-crf', '18',
      '-threads', '0',
      '-t', String(maxDuration),
      '-movflags', '+faststart',
    ];

    if (audioPath) {
      outputOpts.push('-map', `${clipPaths.length}:a:0`, '-af', `apad=whole_dur=${maxDuration}`, '-c:a', 'aac', '-b:a', '192k');
    }

    cmd
      .outputOptions(outputOpts)
      .output(finalPath)
      .on('start', (cmdline: string) => console.info('[FFMPEG_CMD] xfade:', cmdline))
      .on('end', () => resolve())
      .on('error', (err) => {
        console.error(`[STITCH_XFADE_ERR] ${err.message}`);
        reject(new Error(`FFmpeg xfade: ${err.message}`));
      })
      .run();
  });
}

/**
 * FFmpeg fallback: concatenate multiple clips then merge audio in a single pass.
 * All clips and audio are downloaded to /tmp before ffmpeg is invoked.
 * When editingPlan is provided, uses xfade filter chain for proper cut types.
 * Used when Railway Composer is unavailable or fails.
 */
export async function stitchClipsWithAudio(params: {
  clipUrls:    string[];
  audioUrl?:   string;
  userId?:     string;
  maxDuration?: number;   // hard cap in seconds — defaults to 30
  editingPlan?: EditingPlan;
}): Promise<string> {
  const userId = params.userId ?? "anonymous";
  const id = randomUUID();
  const tmpDir = tmpdir();
  const concatListPath = join(tmpDir, `concat-list-${id}.txt`);
  const audioPath      = join(tmpDir, `concat-audio-${id}.mp3`);
  const finalPath      = join(tmpDir, `concat-final-${id}.mp4`);
  const clipPaths: string[] = [];

  try {
    resolveFfmpegPath();
    const stitchT0 = Date.now();

    // ── Step 1: Download every clip to /tmp ──────────────────────────────────
    for (let i = 0; i < params.clipUrls.length; i++) {
      const url = params.clipUrls[i];
      console.log(`[STITCH] downloading clip ${i} ${url.substring(0, 70)}`);
      const buf = await fetchMediaBuffer(url, `clip${i}`);
      if (buf.length < 1000) throw new Error(`[STITCH] clip ${i} returned only ${buf.length} bytes — invalid`);
      const p = join(tmpDir, `concat-clip${i}-${id}.mp4`);
      writeFileSync(p, buf);
      clipPaths.push(p);
      console.log(`[STITCH] clip ${i} saved ${buf.length} bytes → ${p}`);
    }
    console.log(`[STITCH] all ${clipPaths.length} clips downloaded to /tmp`);
    console.info('[STITCH_CLIPS]', { count: clipPaths.length, paths: clipPaths });
    const clipDurations = await Promise.all(clipPaths.map(p => probeDuration(p)));
    const videoTrackDuration = clipDurations.reduce((sum, d) => sum + d, 0);
    console.log(`[STITCH_TRACK] videoTrackDuration=${videoTrackDuration.toFixed(2)}s clips=${clipPaths.length}`);

    // ── Step 2: Download audio to /tmp ───────────────────────────────────────
    let hasAudio = false;
    if (params.audioUrl) {
      console.log(`[STITCH] downloading audio ${params.audioUrl.substring(0, 70)}`);
      const audioBuf = await fetchMediaBuffer(params.audioUrl, "stitch-audio");
      writeFileSync(audioPath, audioBuf);
      hasAudio = true;
      console.log(`[STITCH] audio saved ${audioBuf.length} bytes → ${audioPath}`);
    }

    // If only 1 clip and no audio, just return it directly
    if (clipPaths.length === 1 && !hasAudio) {
      return params.clipUrls[0];
    }

    // ── Step 3: xfade path (when editingPlan provided) ───────────────────────
    if (params.editingPlan && clipPaths.length > 1) {
      console.log(`[STITCH] using xfade path (${clipPaths.length} clips)`);
      try {
        await runXfadeStitch({
          clipPaths,
          editingPlan: params.editingPlan,
          audioPath:   hasAudio ? audioPath : null,
          maxDuration: params.maxDuration ?? 30,
          finalPath,
        });
        // skip to upload step below — fall through
        const xfadeBuf = readFileSync(finalPath);
        if (xfadeBuf.length < 1000) throw new Error(`xfade output only ${xfadeBuf.length} bytes`);
        const storePath = `final/${userId}/${Date.now()}-stitched.mp4`;
        const { data: xd, error: xe } = await supabaseAdmin.storage
          .from("renders")
          .upload(storePath, xfadeBuf, { contentType: "video/mp4", upsert: true });
        if (xe) throw new Error(`[STITCH] xfade upload failed: ${xe.message}`);
        const { data: { publicUrl: xUrl } } = supabaseAdmin.storage.from("renders").getPublicUrl(xd.path);
        console.log(`[STITCH_XFADE_OK] ${clipPaths.length} clips url=${xUrl.substring(0, 80)}`);
        return xUrl;
      } catch (xErr) {
        console.warn(`[STITCH] xfade failed, falling back to concat: ${xErr instanceof Error ? xErr.message : xErr}`);
        // fall through to concat path
      }
    }

    // ── Step 3: Write concat list ────────────────────────────────────────────
    // When video track is longer than the audio cap, trim the last clip so
    // ffmpeg concat doesn't include extra silent video after audio ends.
    const maxDur = params.maxDuration ?? 30;
    let concatList: string;
    if (maxDur < videoTrackDuration && clipPaths.length > 1) {
      const lastClipDur = maxDur - (clipPaths.length - 1) * 10;
      console.log(`[STITCH_TRIM] videoTrackDuration=${videoTrackDuration.toFixed(2)}s > maxDur=${maxDur}s — trimming last clip to ${lastClipDur.toFixed(2)}s`);
      concatList = [
        ...clipPaths.slice(0, -1).map(p => `file '${p}'`),
        `file '${clipPaths[clipPaths.length - 1]}'\nduration ${lastClipDur.toFixed(3)}`,
      ].join("\n");
    } else {
      concatList = clipPaths.map(p => `file '${p}'`).join("\n");
    }
    writeFileSync(concatListPath, concatList);
    console.log(`[STITCH] concat list written:\n${concatList}`);

    // ── Step 4: Single-pass ffmpeg — concat clips + merge audio ─────────────
    const tLimit = String(params.maxDuration ?? 30);
    console.log(`[STITCH] running ffmpeg concat + audio merge hasAudio=${hasAudio} maxDuration=${tLimit}s`);

    const totalDuration = params.maxDuration ?? 30;
    const fadeOutStart = Math.min(totalDuration - 0.5, videoTrackDuration - 0.5);
    const fadeFilter = `fade=t=in:st=0:d=0.5,fade=t=out:st=${fadeOutStart.toFixed(2)}:d=0.5`;

    if (hasAudio) {
      // Concat + audio in one pass
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(concatListPath)
          .inputOptions(["-f", "concat", "-safe", "0"])
          .input(audioPath)
          .outputOptions([
            "-c:v", "libx264",
            "-preset", "slow",
            "-crf", "18",
            "-threads", "0",
            "-c:a", "aac",
            "-b:a", "192k",
            "-vf", fadeFilter,
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-t", tLimit,
            "-movflags", "+faststart",
          ])
          .output(finalPath)
          .on("start", (cmdline: string) => console.info('[FFMPEG_CMD] concat+audio:', cmdline))
          .on("end", () => resolve())
          .on("error", (err) => {
            console.error(`[STITCH_FFMPEG_ERR] ${err.message}`);
            reject(new Error(`FFmpeg stitch+audio: ${err.message}`));
          })
          .run();
      });
    } else {
      // Concat only — no audio
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(concatListPath)
          .inputOptions(["-f", "concat", "-safe", "0"])
          .outputOptions([
            "-c:v", "libx264",
            "-preset", "slow",
            "-crf", "18",
            "-vf", fadeFilter,
            "-t", tLimit,
            "-movflags", "+faststart",
          ])
          .output(finalPath)
          .on("start", (cmdline: string) => console.info('[FFMPEG_CMD] concat-only:', cmdline))
          .on("end", () => resolve())
          .on("error", (err) => {
            console.error(`[STITCH_FFMPEG_ERR] ${err.message}`);
            reject(new Error(`FFmpeg concat: ${err.message}`));
          })
          .run();
      });
    }

    console.log(`[STITCH] ffmpeg complete elapsed=${Date.now() - stitchT0}ms clips=${clipPaths.length}`);

    if (!existsSync(finalPath)) throw new Error("[STITCH] ffmpeg produced no output file");
    const finalBuf = readFileSync(finalPath);
    if (finalBuf.length < 1000) throw new Error(`[STITCH] output file only ${finalBuf.length} bytes — ffmpeg failed silently`);

    // ── Step 5: Upload to Supabase renders bucket ────────────────────────────
    console.log(`[STITCH] uploading ${finalBuf.length} bytes to Supabase`);
    const storePath = `final/${userId}/${Date.now()}-stitched.mp4`;
    const { data, error } = await supabaseAdmin.storage
      .from("renders")
      .upload(storePath, finalBuf, { contentType: "video/mp4", upsert: true });
    if (error) throw new Error(`[STITCH] upload failed: ${error.message}`);

    const { data: { publicUrl } } = supabaseAdmin.storage.from("renders").getPublicUrl(data.path);
    console.log(`[STITCH_OK] ${clipPaths.length} clips hasAudio=${hasAudio} url=${publicUrl.substring(0, 80)}`);
    return publicUrl;

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? (e.stack ?? "") : "";
    console.error(`[STITCH_FATAL] ${msg}`);
    if (stack) console.error(`[STITCH_FATAL_STACK] ${stack.substring(0, 500)}`);
    // Last resort: return first clip URL raw
    return params.clipUrls[0] ?? params.audioUrl ?? "";
  } finally {
    [...clipPaths, concatListPath, audioPath, finalPath]
      .forEach(p => { try { unlinkSync(p); } catch {} });
  }
}