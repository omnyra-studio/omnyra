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
import { randomUUID }  from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

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
  console.info(`[STITCHER] Starting with ${clips.length} clips + voice=${!!options.voiceoverUrl}`);

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

  // Download video clips in parallel, then voiceover if present
  const localPaths = await Promise.all(
    selected.map(async (clip, i) => {
      const dest = path.join(WORK_DIR, `clip_${i}_${randomUUID()}.mp4`);
      await downloadFile(clip.video_url, dest);
      return dest;
    }),
  );

  let resolvedVoiceoverPath: string | null = null;
  if (options.voiceoverUrl) {
    resolvedVoiceoverPath = path.join(WORK_DIR, `vo_${randomUUID()}.mp3`);
    await downloadFile(options.voiceoverUrl, resolvedVoiceoverPath);
  }

  const outputPath = path.join(WORK_DIR, `stitch_${randomUUID()}.mp4`);

  await runConcat(localPaths, outputPath, resolvedVoiceoverPath ?? null, coverTarget);

  // Upload to Supabase storage
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

  // If voiceover is present, it drives duration via -shortest.
  // Use voice duration as the authoritative output length.
  const outputDuration = options.voiceDurationSecs ?? Math.min(accumulated, targetSecs);

  console.info("[clip-stitcher] complete", {
    plan_id:          options.planId,
    clips:            selected.length,
    video_secs:       accumulated,
    voice_secs:       options.voiceDurationSecs ?? "none",
    output_secs:      outputDuration,
    url:              publicData.publicUrl.slice(0, 80),
  });

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
  localPaths:       string[],
  outputPath:       string,
  voiceoverPath:    string | null,
  targetSecs:       number,
): Promise<void> {
  const silentPath = outputPath.replace(".mp4", "-silent.mp4");
  const listPath   = outputPath.replace(".mp4", "-list.txt");

  // Pass 1: write concat list, stitch clips with filter_complex (scale+pad)
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
      .outputOptions(["-map [vout]", "-an", "-c:v libx264", "-preset fast", "-crf 23", "-pix_fmt yuv420p"])
      .output(silentPath)
      .on("error", (err, _s, stderr) => {
        console.error("[clip-stitcher] pass1 error:", err.message, (stderr as string | undefined)?.slice(-800));
        reject(err);
      })
      .on("end", () => resolve())
      .run();
  });

  try { fs.unlinkSync(listPath); } catch { /* noop */ }

  if (!voiceoverPath) {
    fs.renameSync(silentPath, outputPath);
    return;
  }

  // Probe durations so we can log the mismatch
  const [vidDur, audDur] = await Promise.all([
    probeDuration(silentPath),
    probeDuration(voiceoverPath),
  ]);
  console.info("[STITCHER] pass2 probe", {
    video_secs: vidDur.toFixed(2),
    audio_secs: audDur.toFixed(2),
    cap_secs:   targetSecs + 5,
  });

  // Pass 2: mix — voice drives duration via -shortest; +5s buffer so video never
  // runs out before audio finishes
  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(silentPath)
      .input(voiceoverPath)
      .outputOptions([
        "-c:v libx264",
        "-c:a aac",
        "-map 0:v:0",
        "-map 1:a:0",
        "-preset fast",
        "-crf 23",
        "-pix_fmt yuv420p",
        "-b:a 192k",
        "-shortest",               // stop when voice ends (not when video ends)
        `-t ${targetSecs + 5}`,    // absolute safety cap
        "-movflags +faststart",
      ])
      .output(outputPath)
      .on("error", (err, _s, stderr) => {
        console.error("[clip-stitcher] pass2 error:", err.message, (stderr as string | undefined)?.slice(-800));
        reject(err);
      })
      .on("end", () => resolve())
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
