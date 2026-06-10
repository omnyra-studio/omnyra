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

// Vercel's bundle is read-only — copy ffmpeg binary to /tmp so it's executable.
function resolveFfmpegPath(): string | null {
  if (!ffmpegStatic) return null;
  if (process.platform === "linux") {
    const tmp = "/tmp/ffmpeg_omnyra";
    try {
      if (!fs.existsSync(tmp)) {
        fs.copyFileSync(ffmpegStatic, tmp);
        execSync(`chmod 755 ${tmp}`);
      }
      return tmp;
    } catch {
      return ffmpegStatic;
    }
  }
  return ffmpegStatic;
}
const FFMPEG_PATH = resolveFfmpegPath();
if (FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(FFMPEG_PATH);
  console.info("[clip-stitcher] ffmpeg path:", FFMPEG_PATH);
} else {
  console.warn("[clip-stitcher] WARNING: ffmpeg-static not found — stitch will fail");
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
  userId:             string;
  planId:             string;
  voiceoverUrl?:      string;   // full-video voiceover to mix in
  speedMode?:         'ultra-draft' | 'draft' | 'balanced' | 'quality';
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
  const coverTarget = Math.max(targetSecs, options.voiceDurationSecs ?? 0);
  let accumulated   = 0;
  const selected: StitchClip[] = [];
  for (const clip of sorted) {
    selected.push(clip);
    accumulated += clip.duration_seconds;
    if (accumulated >= coverTarget) break;
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

  const outputPath = path.join(WORK_DIR, `stitch_${randomUUID()}.mp4`);
  const concatT0 = Date.now();

  await runConcat(localPaths, outputPath, resolvedVoiceoverPath ?? null, coverTarget, speedMode);
  const concatMs = Date.now() - concatT0;

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

  // If voiceover is present, it drives duration via -shortest.
  const outputDuration = options.voiceDurationSecs ?? Math.min(accumulated, targetSecs);
  const totalMs = Date.now() - stitchT0;

  console.info(
    `[SPEED_BREAKDOWN:stitch] mode=${speedMode} | download=${dlMs}ms | ffmpeg=${concatMs}ms | upload=${uploadMs}ms | total=${totalMs}ms` +
    ` | clips=${selected.length} preset=${speedMode === 'ultra-draft' ? 'veryfast/crf22' : speedMode === 'draft' ? 'fast/crf20' : speedMode === 'balanced' ? 'medium/crf18' : 'slow/crf16'}`,
  );

  return {
    output_url:       publicData.publicUrl,
    duration_seconds: outputDuration,
    clip_count:       selected.length,
  };
}

// ── FFmpeg two-pass stitch ────────────────────────────────────────────────────
// Pass 1: concat demuxer — stitch clips into a silent video (fast, stream copy)
// Pass 2: mix silent video + voiceover, -shortest so voice drives final length

function probeDuration(filePath: string): Promise<number> {
  return new Promise(resolve => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) { resolve(0); return; }
      const dur = meta?.format?.duration ?? 0;
      resolve(typeof dur === "number" ? dur : parseFloat(String(dur)) || 0);
    });
  });
}

async function runConcat(
  localPaths:    string[],
  outputPath:    string,
  voiceoverPath: string | null,
  targetSecs:    number,
  speedMode:     'ultra-draft' | 'draft' | 'balanced' | 'quality' = 'balanced',
): Promise<void> {
  const isUltraDraft = speedMode === 'ultra-draft';
  // veryfast+22 → great quality with big speed gain; slow+16 → max quality
  const preset      = speedMode === 'ultra-draft' ? 'veryfast' : speedMode === 'draft' ? 'fast' : speedMode === 'balanced' ? 'medium' : 'slow';
  const crf         = speedMode === 'ultra-draft' ? '22'       : speedMode === 'draft' ? '20'  : speedMode === 'balanced' ? '18'     : '16';
  const audioBitrate = speedMode === 'ultra-draft' ? '128k'    : speedMode === 'draft' ? '160k': '192k';

  const silentPath = outputPath.replace(".mp4", "-silent.mp4");
  const listPath   = outputPath.replace(".mp4", "-list.txt");

  const p1T0 = Date.now();
  fs.writeFileSync(listPath, localPaths.map(p => `file '${p}'`).join("\n"));

  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg();
    for (const p of localPaths) cmd.input(p);

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
      .outputOptions(["-map [vout]", "-an", "-c:v libx264", `-preset ${preset}`, `-crf ${crf}`, "-tune film", "-pix_fmt yuv420p"])
      .output(silentPath)
      .on("error", (err, _s, stderr) => {
        console.error("[STITCH] pass1 error:", err.message, (stderr as string | undefined)?.slice(-800));
        reject(err);
      })
      .on("end", () => { console.info(`[STITCH] pass1 done ms=${Date.now() - p1T0} preset=${preset} crf=${crf}`); resolve(); })
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
    video_secs: vidDur.toFixed(2),
    audio_secs: audDur.toFixed(2),
    cap_secs:   targetSecs + 5,
  });

  const p2T0 = Date.now();
  // ultra-draft: copy video stream (no re-encode), only encode the new audio track
  const p2VideoCodec = isUltraDraft ? ["-c:v copy"] : ["-c:v libx264", `-preset ${preset}`, `-crf ${crf}`, "-pix_fmt yuv420p"];
  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(silentPath)
      .input(voiceoverPath)
      .outputOptions([
        ...p2VideoCodec,
        "-c:a aac",
        "-map 0:v:0",
        "-map 1:a:0",
        `-b:a ${audioBitrate}`,
        "-shortest",
        `-t ${targetSecs + 5}`,
        "-movflags +faststart",
      ])
      .output(outputPath)
      .on("error", (err, _s, stderr) => {
        console.error("[STITCH] pass2 error:", err.message, (stderr as string | undefined)?.slice(-800));
        reject(err);
      })
      .on("end", () => { console.info(`[STITCH] pass2 done ms=${Date.now() - p2T0} ultra=${isUltraDraft}`); resolve(); })
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
