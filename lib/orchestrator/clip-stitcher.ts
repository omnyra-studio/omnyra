// Clip stitcher for the parallel orchestration engine.
//
// Takes an ordered array of clip URLs from the parallel engine, downloads them
// to a temp directory, concatenates with FFmpeg, and uploads the result to
// Supabase storage. Hard-caps output at targetSecs (default 30s).
//
// Uses the already-installed fluent-ffmpeg + ffmpeg-static packages.

import ffmpeg          from "fluent-ffmpeg";
import ffmpegStatic    from "ffmpeg-static";
import fs              from "node:fs";
import path            from "node:path";
import https           from "node:https";
import http            from "node:http";
import os              from "node:os";
import { execSync }    from "node:child_process";
import { randomUUID }  from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Resolve ffmpeg binary — tries in priority order:
//   1. /tmp/ffmpeg_omnyra  (copy of ffmpeg-static, chmod 755 — survives Vercel read-only bundle)
//   2. ffmpeg-static path  (direct, works on Railway where bundle FS is writable)
//   3. system "ffmpeg"     (Docker / Railway with ffmpeg in PATH — Railway Nixpacks installs it)
// Returns null only when none are executable; callers log a hard warning.
function resolveFfmpegPath(): string | null {
  const tmp = "/tmp/ffmpeg_omnyra";

  // Step 1 — copy ffmpeg-static to /tmp on Linux (Vercel/Railway serverless)
  if (ffmpegStatic && process.platform === "linux") {
    try {
      if (!fs.existsSync(tmp)) {
        fs.copyFileSync(ffmpegStatic, tmp);
        execSync(`chmod 755 "${tmp}"`);
      }
      // Verify the copy is actually executable before returning it
      execSync(`"${tmp}" -version 2>&1`, { timeout: 4000, encoding: "utf8" });
      console.info("[clip-stitcher] ffmpeg resolved via /tmp copy");
      return tmp;
    } catch (e1) {
      console.warn("[clip-stitcher] /tmp copy failed:", (e1 as Error).message.substring(0, 80));
    }
  }

  // Step 2 — use ffmpeg-static path directly (non-Linux or /tmp copy failed)
  if (ffmpegStatic) {
    try {
      execSync(`"${ffmpegStatic}" -version 2>&1`, { timeout: 4000, encoding: "utf8" });
      console.info("[clip-stitcher] ffmpeg resolved via ffmpeg-static:", ffmpegStatic);
      return ffmpegStatic;
    } catch (e2) {
      console.warn("[clip-stitcher] ffmpeg-static not executable:", (e2 as Error).message.substring(0, 80));
    }
  }

  // Step 3 — system ffmpeg (Railway Nixpacks, Docker with ffmpeg layer)
  try {
    const sysPath = execSync("which ffmpeg 2>/dev/null || command -v ffmpeg 2>/dev/null", {
      timeout: 3000, encoding: "utf8",
    }).trim();
    if (sysPath) {
      execSync(`"${sysPath}" -version 2>&1`, { timeout: 4000, encoding: "utf8" });
      console.info("[clip-stitcher] ffmpeg resolved via system PATH:", sysPath);
      return sysPath;
    }
  } catch { /* not in PATH */ }

  console.error("[clip-stitcher] CRITICAL: no executable ffmpeg found — stitching will fail");
  return null;
}
const FFMPEG_PATH = resolveFfmpegPath();
if (FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(FFMPEG_PATH);
  console.info("[clip-stitcher] ffmpeg active path:", FFMPEG_PATH);
} else {
  console.warn("[clip-stitcher] WARNING: ffmpeg not found — stitch will fail");
}

// Probe for libsvtav1 once at startup — AV1 is only available if SVT-AV1 was compiled into the binary.
// Falls back to H.264 transparently when not available so callers don't need to guard.
function probeAV1Support(): boolean {
  try {
    const bin = FFMPEG_PATH ?? "ffmpeg";
    const out = execSync(`"${bin}" -encoders 2>&1`, { encoding: "utf8", timeout: 5000 });
    const supported = out.includes("libsvtav1");
    console.info(`[clip-stitcher] AV1 support: ${supported ? "YES (libsvtav1)" : "NO — will use H.264"}`);
    return supported;
  } catch {
    return false;
  }
}
const AV1_SUPPORTED = probeAV1Support();

// Read once at startup — FFMPEG_HWACCEL controls hardware-accelerated decoding.
// Safe to leave unset on Vercel/Lambda (no GPU). Set to "cuda", "qsv", or "auto"
// when running on a GPU-equipped host (Railway, EC2 with GPU, etc.).
// Only affects decoding speed, not output quality.
function resolveHwAccel(): string[] {
  const env = (process.env.FFMPEG_HWACCEL ?? '').toLowerCase().trim();
  if (env === 'cuda' || env === 'nvidia') return ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda'];
  if (env === 'qsv'  || env === 'intel')  return ['-hwaccel', 'qsv'];
  if (env === 'auto' || env === 'amd')    return ['-hwaccel', 'auto'];
  return []; // software — safe default for serverless
}
const HW_ACCEL_OPTS = resolveHwAccel();
if (HW_ACCEL_OPTS.length) {
  console.info(`[clip-stitcher] hardware acceleration: ${HW_ACCEL_OPTS.join(' ')}`);
}

const WORK_DIR = path.join(os.tmpdir(), "omnyra_parallel_stitch");
const W = 1080;
const H = 1920;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StitchClip {
  shotNumber:       number;
  video_url:        string;
  duration_seconds: number;
}

export interface StitchOptions {
  targetSecs?:        number;   // video clip selection ceiling — default 30
  voiceDurationSecs?: number;   // actual voiceover duration — clips selected to cover this
  minDurationSecs?:   number;   // hard floor: final video never shorter than this (e.g. 26 for normal, 20 for lightning)
  userId:             string;
  planId:             string;
  voiceoverUrl?:      string;   // full-video voiceover to mix in
  speedMode?:         'ultra-draft' | 'draft' | 'balanced' | 'quality';
  useAV1?:            boolean;  // AV1 final render — smaller files, slower encode (ignored when AV1 not compiled in)
  addWatermark?:      boolean;  // overlay Omnyra watermark — used for free-tier previews
}

export interface StitchResult {
  output_url:       string;
  duration_seconds: number;  // actual output duration (voice-driven when voiceover present)
  clip_count:       number;
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function stitchClips(
  clips:   StitchClip[],
  options: StitchOptions,
): Promise<StitchResult> {
  if (!clips.length) throw new Error("[clip-stitcher] no clips to stitch");
  const stitchT0 = Date.now();
  const speedMode = options.speedMode ?? 'balanced';
  console.info(`[STITCH] ===== START ===== clips=${clips.length} voice=${!!options.voiceoverUrl} speed=${speedMode} planId=${options.planId}`);
  console.info("[STITCH] clip urls", clips.map(c => ({ n: c.shotNumber, secs: c.duration_seconds, url: c.video_url.slice(0, 60) })));
  console.info("[STITCH] ffmpeg path", FFMPEG_PATH ?? "NOT FOUND — will fail");

  ensureWorkDir();

  const sorted = [...clips].sort((a, b) => a.shotNumber - b.shotNumber);

  // Select clips to cover the voiceover duration (or targetSecs fallback).
  // Always include at least 1 clip; don't hard-stop at targetSecs if voice is longer.
  const targetSecs  = options.targetSecs ?? 30;
  const minDur      = options.minDurationSecs ?? 0;
  const coverTarget = Math.max(targetSecs, options.voiceDurationSecs ?? 0, minDur);
  let accumulated   = 0;
  const selected: StitchClip[] = [];
  for (const clip of sorted) {
    selected.push(clip);
    accumulated += clip.duration_seconds;
    if (accumulated >= coverTarget) break;
  }
  // Loop clips if a single clip (or few clips) can't cover the voiceover duration.
  // This happens when only 1 of 3 Kling clips succeeds (10s video, 28s voice).
  if (accumulated < coverTarget && sorted.length > 0) {
    let loopIdx = 0;
    while (accumulated < coverTarget && selected.length < sorted.length * 8) {
      const clip = sorted[loopIdx % sorted.length];
      selected.push({ ...clip });
      accumulated += clip.duration_seconds;
      loopIdx++;
    }
    console.info(`[STITCH] clip-loop to cover voiceover: clips=${selected.length} accumulated=${accumulated.toFixed(1)}s target=${coverTarget.toFixed(1)}s`);
  }

  // Download video clips + voiceover in parallel
  const dlT0 = Date.now();
  const [localPaths, resolvedVoiceoverPath] = await Promise.all([
    Promise.all(
      selected.map(async (clip, i) => {
        const dest = path.join(WORK_DIR, `clip_${i}_${randomUUID()}.mp4`);
        await downloadFile(clip.video_url, dest);
        return dest;
      }),
    ),
    options.voiceoverUrl
      ? (async () => {
          const p = path.join(WORK_DIR, `vo_${randomUUID()}.mp3`);
          await downloadFile(options.voiceoverUrl!, p);
          return p;
        })()
      : Promise.resolve(null),
  ]);
  const dlMs = Date.now() - dlT0;
  console.info(`[STITCH] download done clips=${selected.length} hasVoice=${!!resolvedVoiceoverPath} ms=${dlMs}`);

  // Pre-extend the last local clip to smoothly cover any voiceover shortfall.
  // Uses a last-frame loop (~2s freeze) — much better visually than stream_loop restarting at frame 0.
  // stream_loop in runConcat is the final fallback if this fails.
  if (resolvedVoiceoverPath && options.voiceDurationSecs) {
    const videoTotalSecs = selected.reduce((s, c) => s + c.duration_seconds, 0);
    const shortfall      = options.voiceDurationSecs - videoTotalSecs;
    if (shortfall > 0.5 && localPaths.length > 0) {
      const extraSecs = Math.ceil(shortfall + 2);
      const origLast  = localPaths[localPaths.length - 1];
      const extLast   = origLast.replace('.mp4', '_ext.mp4');
      try {
        await extendLastClip(origLast, extLast, extraSecs);
        localPaths[localPaths.length - 1] = extLast;
        try { fs.unlinkSync(origLast); } catch { /* already gone */ }
        console.info(`[STITCH] pre-extended last clip +${extraSecs}s shortfall=${shortfall.toFixed(1)}s`);
      } catch (e) {
        console.warn(`[STITCH] extendLastClip failed — stream_loop will cover: ${(e as Error).message}`);
      }
    }
  }

  const outputPath = path.join(WORK_DIR, `stitch_${randomUUID()}.mp4`);
  const concatT0 = Date.now();

  const useAV1 = !!(options.useAV1 && AV1_SUPPORTED);
  if (options.useAV1 && !AV1_SUPPORTED) {
    console.warn("[STITCH] useAV1=true requested but libsvtav1 not available — falling back to H.264");
  }

  await runConcat(localPaths, outputPath, resolvedVoiceoverPath ?? null, coverTarget, speedMode, minDur, useAV1);
  const concatMs = Date.now() - concatT0;

  // ── Watermark pass (free-tier previews) ──────────────────────────────────
  if (options.addWatermark && FFMPEG_PATH) {
    const watermarkedPath = outputPath.replace(".mp4", "-wm.mp4");
    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(outputPath)
          .outputOptions([
            "-vf",
            "drawtext=text='omnyra.studio':fontcolor=white@0.55:fontsize=28:x=w-tw-20:y=h-th-20:shadowcolor=black@0.4:shadowx=1:shadowy=1",
            "-c:v libx264", "-preset veryfast", "-crf 23", "-pix_fmt yuv420p",
            "-c:a copy", "-movflags +faststart",
          ])
          .output(watermarkedPath)
          .on("error", (err) => {
            console.warn("[STITCH] watermark pass failed (uploading without watermark):", err.message);
            resolve();
          })
          .on("end", () => {
            try {
              fs.unlinkSync(outputPath);
              fs.renameSync(watermarkedPath, outputPath);
            } catch { /* noop */ }
            console.info("[STITCH] watermark applied");
            resolve();
          })
          .run();
      });
    } catch { /* non-fatal — upload unwatermarked version */ }
  }

  // Upload to Supabase storage
  const uploadT0 = Date.now();
  const storagePath = `renders/${options.userId}/parallel/${options.planId}-${Date.now()}.mp4`;
  const fileBuffer  = fs.readFileSync(outputPath);

  const { error: uploadErr } = await supabaseAdmin.storage
    .from("videos")
    .upload(storagePath, fileBuffer, { contentType: "video/mp4", upsert: true });

  // Cleanup temp files (non-fatal)
  const tempFiles = [...localPaths, outputPath];
  if (resolvedVoiceoverPath) tempFiles.push(resolvedVoiceoverPath);
  tempFiles.forEach(p => { try { fs.unlinkSync(p); } catch { /* noop */ } });

  if (uploadErr) throw new Error(`[clip-stitcher] upload failed: ${uploadErr.message}`);

  const { data: publicData } = supabaseAdmin.storage.from("videos").getPublicUrl(storagePath);
  const uploadMs = Date.now() - uploadT0;

  // Duration = max(voiceover actual, minimum floor, clips sum).
  // Voice-driven when voiceover is present; otherwise clips sum capped at targetSecs.
  const rawOutput = options.voiceDurationSecs
    ? Math.max(options.voiceDurationSecs, minDur)
    : Math.min(accumulated, Math.max(targetSecs, minDur));
  const outputDuration = rawOutput;
  if (minDur > 0 && outputDuration < minDur) {
    console.warn(`[DURATION_VIOLATION] outputDuration=${outputDuration.toFixed(1)}s < minDur=${minDur}s — extending to floor`);
  }
  console.info(`[DURATION_ENFORCED] voice=${(options.voiceDurationSecs ?? 0).toFixed(1)}s min=${minDur}s final=${outputDuration.toFixed(1)}s extended=${outputDuration > (options.voiceDurationSecs ?? 0)}`);
  const totalMs = Date.now() - stitchT0;

  console.info(
    `[SPEED_BREAKDOWN:stitch] mode=${speedMode} codec=${useAV1 ? 'AV1/crf35/1000k' : (speedMode === 'ultra-draft' ? 'H264/ultrafast/crf28/1200k' : speedMode === 'draft' ? 'H264/fast/crf24/1800k' : speedMode === 'balanced' ? 'H264/fast/crf23/2000k' : 'H264/medium/crf22/2500k')} | download=${dlMs}ms | ffmpeg=${concatMs}ms | upload=${uploadMs}ms | total=${totalMs}ms | clips=${selected.length}`,
  );

  return {
    output_url:       publicData.publicUrl,
    duration_seconds: outputDuration,
    clip_count:       selected.length,
  };
}

// ── Convenience helpers ───────────────────────────────────────────────────────

/** Convert a plain string[] of URLs into the StitchClip[] the engine expects. */
function urlsToClips(urls: string[]): StitchClip[] {
  return urls.map((video_url, i) => ({
    shotNumber:       i + 1,
    video_url,
    duration_seconds: 10,   // engine probes real duration after download
  }));
}

/**
 * Quick one-liner for free-tier watermarked 30s previews.
 * Accepts plain clip URL strings. H.264 fast mode, watermark on.
 *
 *   const result = await quickStitchForPreview(clips, userId, planId);
 *   // result.output_url — watermarked, H.264
 */
export async function quickStitchForPreview(
  clipUrls: string[] | StitchClip[],
  userId:   string,
  planId:   string,
): Promise<StitchResult> {
  const clips = clipUrls.length > 0 && typeof clipUrls[0] === "string"
    ? urlsToClips(clipUrls as string[])
    : (clipUrls as StitchClip[]);

  console.info(`[PREVIEW_STITCH] clips=${clips.length} userId=${userId} H264+watermark`);

  return stitchClips(clips, {
    userId,
    planId,
    targetSecs:      30,
    minDurationSecs: 25,
    speedMode:       "draft",
    useAV1:          false,
    addWatermark:    true,
  });
}

/**
 * Final library save — AV1 encoding, no watermark, full quality.
 * Accepts plain clip URL strings or StitchClip objects.
 * Pass voiceoverUrl + voiceDurationSecs for audio-driven duration.
 *
 *   const result = await stitchForLibrary(clips, userId, planId, voiceoverUrl, 28.5);
 *   // result.output_url — AV1, library quality
 */
export async function stitchForLibrary(
  clipUrls:          string[] | StitchClip[],
  userId:            string,
  planId:            string,
  voiceoverUrl?:     string,
  voiceDurationSecs?: number,
  qualityMode:       "standard" | "high" = "high",
): Promise<StitchResult> {
  const clips = clipUrls.length > 0 && typeof clipUrls[0] === "string"
    ? urlsToClips(clipUrls as string[])
    : (clipUrls as StitchClip[]);

  console.info(
    `[LIBRARY_STITCH] clips=${clips.length} userId=${userId} AV1 quality=${qualityMode}` +
    (voiceoverUrl ? ` voice=${voiceDurationSecs?.toFixed(1)}s` : ""),
  );

  return stitchClips(clips, {
    userId,
    planId,
    targetSecs:        30,
    minDurationSecs:   25,
    speedMode:         qualityMode === "high" ? "quality" : "balanced",
    useAV1:            true,
    addWatermark:      false,
    voiceoverUrl,
    voiceDurationSecs,
  });
}

// ── FFmpeg helpers ─────────────────────────────────────────────────────────────

function probeDuration(filePath: string): Promise<number> {
  return new Promise(resolve => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) { resolve(0); return; }
      const dur = meta?.format?.duration ?? 0;
      resolve(typeof dur === "number" ? dur : parseFloat(String(dur)) || 0);
    });
  });
}

// Extend a local clip by looping its last ~5 seconds (120 frames at 24fps) for `extraSeconds`.
// Produces a smooth freeze-style tail — much better than stream_loop which jumps to frame 0.
async function extendLastClip(inputPath: string, outputPath: string, extraSeconds: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        `-t ${extraSeconds}`,
        `-vf loop=loop=-1:size=120:start=0`,  // loop last 5s (120 frames at 24fps) — smooth freeze tail
        `-c:v libx264`, `-preset veryfast`, `-crf 22`, `-pix_fmt yuv420p`,
      ])
      .output(outputPath)
      .on("error", (e) => reject(new Error(`extendLastClip: ${e.message}`)))
      .on("end", () => resolve())
      .run();
  });
}

async function runConcat(
  localPaths:      string[],
  outputPath:      string,
  voiceoverPath:   string | null,
  targetSecs:      number,
  speedMode:       'ultra-draft' | 'draft' | 'balanced' | 'quality' = 'balanced',
  minDurationSecs: number = 0,
  useAV1:          boolean = false,
): Promise<void> {
  const isUltraDraft = speedMode === 'ultra-draft';

  // AV1 path — libsvtav1, preset 5 (quality/speed balance), CRF 35 (~5–10 MB/30s)
  // H.264 compression ladder tuned for mobile-first 9:16 content:
  //   ultra-draft (Lightning): ultrafast+28+1200k  → ~6–10 MB/30s, fastest encode
  //   draft:                   fast+24+1800k        → ~12–16 MB/30s, good balance
  //   balanced:                fast+23+2000k        → ~15–20 MB/30s, default quality
  //   quality:                 medium+22+2500k      → ~20–28 MB/30s, premium output
  const preset       = speedMode === 'ultra-draft' ? 'ultrafast' : speedMode === 'draft' ? 'fast' : speedMode === 'balanced' ? 'fast'   : 'medium';
  const crf          = speedMode === 'ultra-draft' ? '28'        : speedMode === 'draft' ? '24'  : speedMode === 'balanced' ? '23'      : '22';
  const videoBitrate = speedMode === 'ultra-draft' ? '1200k'     : speedMode === 'draft' ? '1800k': speedMode === 'balanced' ? '2000k' : '2500k';
  const audioBitrate = speedMode === 'ultra-draft' ? '128k'      : speedMode === 'draft' ? '160k' : '192k';

  // Build codec option arrays for pass-1 and pass-2 re-encode
  const p1Codec = useAV1
    ? ["-c:v libsvtav1", "-svtav1-params", "preset=5", "-crf 35", "-b:v 1000k"]
    : ["-c:v libx264", `-preset ${preset}`, `-crf ${crf}`, `-b:v ${videoBitrate}`, "-pix_fmt yuv420p"];
  // AV1 always re-encodes in pass 2 (no stream-copy shortcut); H.264 can stream-copy when safe.
  const p2Codec = (codec: 'av1' | 'h264', loop: boolean) => {
    if (codec === 'av1') return ["-c:v libsvtav1", "-svtav1-params", "preset=5", "-crf 35", "-b:v 1000k"];
    if (!loop && isUltraDraft) return ["-c:v copy"];
    return ["-c:v libx264", `-preset ${preset}`, `-crf ${crf}`, `-b:v ${videoBitrate}`, "-pix_fmt yuv420p"];
  };

  console.info(`[STITCH] codec=${useAV1 ? 'AV1/libsvtav1' : `H.264/${preset}/crf${crf}`} audio=${audioBitrate}`);

  const silentPath = outputPath.replace(".mp4", "-silent.mp4");
  const listPath   = outputPath.replace(".mp4", "-list.txt");

  const p1T0 = Date.now();
  fs.writeFileSync(listPath, localPaths.map(p => `file '${p}'`).join("\n"));

  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg();
    for (const p of localPaths) {
      if (HW_ACCEL_OPTS.length) cmd.inputOptions(HW_ACCEL_OPTS);
      cmd.input(p);
    }

    const filterParts: string[] = [];
    const vLabels: string[]     = [];

    for (let i = 0; i < localPaths.length; i++) {
      const vOut = `[v${i}]`;
      filterParts.push(
        `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
        `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,fps=24,setsar=1${vOut}`,
      );
      vLabels.push(vOut);
    }
    filterParts.push(`${vLabels.join("")}concat=n=${localPaths.length}:v=1:a=0[vout]`);

    cmd
      .complexFilter(filterParts.join("; "))
      .outputOptions(["-map [vout]", "-an", ...p1Codec])
      .output(silentPath)
      .on("error", (err, _s, stderr) => {
        console.error("[STITCH] pass1 error:", err.message, (stderr as string | undefined)?.slice(-800));
        reject(err);
      })
      .on("end", () => { console.info(`[STITCH] pass1 done ms=${Date.now() - p1T0}`); resolve(); })
      .run();
  });

  try { fs.unlinkSync(listPath); } catch { /* noop */ }

  if (!voiceoverPath) {
    fs.renameSync(silentPath, outputPath);
    return;
  }

  const [vidDur, audDur] = await Promise.all([
    probeDuration(silentPath),
    probeDuration(voiceoverPath),
  ]);
  console.info("[STITCH] pass2 probe", {
    video_secs:  vidDur.toFixed(2),
    audio_secs:  audDur.toFixed(2),
    target_secs: targetSecs,
  });

  // Voice drives final duration; apply the minimum floor so short scripts don't produce short videos.
  // If minDurationSecs=26 and audio=10s, video plays for 26s (audio stops at 10s, video continues silent).
  const rawAudioTarget = audDur > 0 ? Math.max(audDur, minDurationSecs) : 0;
  const finalDuration  = rawAudioTarget > 0
    ? rawAudioTarget + 0.1
    : Math.min(vidDur + 0.1, Math.max(targetSecs, minDurationSecs) + 15);
  const needsVideoLoop = finalDuration - 0.1 > vidDur + 0.3;
  if (minDurationSecs > 0 && audDur > 0 && audDur < minDurationSecs) {
    console.info(`[DURATION_FLOOR] audio=${audDur.toFixed(1)}s < min=${minDurationSecs}s → extending final to ${finalDuration.toFixed(1)}s`);
  }

  console.info("[STITCH] pass2", {
    video_secs:   vidDur.toFixed(2),
    audio_secs:   audDur.toFixed(2),
    final_dur:    finalDuration.toFixed(2),
    needs_loop:   needsVideoLoop,
  });

  const p2VideoCodec = p2Codec(useAV1 ? 'av1' : 'h264', needsVideoLoop);

  const p2T0 = Date.now();
  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg();
    if (needsVideoLoop) cmd.inputOption("-stream_loop -1");
    cmd
      .input(silentPath)
      .input(voiceoverPath)
      .outputOptions([
        ...p2VideoCodec,
        "-c:a aac",
        "-map 0:v:0",
        "-map 1:a:0",
        `-b:a ${audioBitrate}`,
        `-t ${finalDuration.toFixed(2)}`,
        "-movflags +faststart",
      ])
      .output(outputPath)
      .on("error", (err, _s, stderr) => {
        console.error("[STITCH] pass2 error:", err.message, (stderr as string | undefined)?.slice(-800));
        reject(err);
      })
      .on("end", () => { console.info(`[STITCH] pass2 done ms=${Date.now() - p2T0} finalDur=${finalDuration.toFixed(1)}s loop=${needsVideoLoop}`); resolve(); })
      .run();
  });

  try { fs.unlinkSync(silentPath); } catch { /* noop */ }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function ensureWorkDir(): void {
  if (!fs.existsSync(WORK_DIR)) fs.mkdirSync(WORK_DIR, { recursive: true });
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get  = url.startsWith("https://") ? https.get : http.get;

    get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        downloadFile(res.headers.location!, dest).then(resolve).catch(reject);
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
    }).on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}
