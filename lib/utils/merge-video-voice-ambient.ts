/**
 * Railway-ready FFmpeg stitch + voice + ambient merge.
 * Concatenates 5×6s clips, mixes voice (1.1) + ambient (0.35), uploads to Supabase `renders`.
 */

import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { supabaseAdmin } from "@/lib/supabase/admin";

const WORK_DIR = process.platform === "linux" ? "/tmp/video_merge" : join(tmpdir(), "video_merge");

function resolveFfmpegPath(): string | null {
  const tmp = "/tmp/ffmpeg_merge_vva";

  if (ffmpegStatic && process.platform === "linux") {
    try {
      if (!existsSync(tmp)) {
        copyFileSync(ffmpegStatic, tmp);
        execSync(`chmod 755 "${tmp}"`);
      }
      execSync(`"${tmp}" -version 2>&1`, { timeout: 4000, encoding: "utf8" });
      return tmp;
    } catch { /* fall through */ }
  }

  if (ffmpegStatic) {
    try {
      execSync(`"${ffmpegStatic}" -version 2>&1`, { timeout: 4000, encoding: "utf8" });
      return ffmpegStatic;
    } catch { /* fall through */ }
  }

  try {
    const sysPath = execSync(
      "which ffmpeg 2>/dev/null || command -v ffmpeg 2>/dev/null",
      { timeout: 3000, encoding: "utf8" },
    ).trim();
    if (sysPath) {
      execSync(`"${sysPath}" -version 2>&1`, { timeout: 4000, encoding: "utf8" });
      return sysPath;
    }
  } catch { /* not in PATH */ }

  return null;
}

const FFMPEG_PATH = resolveFfmpegPath();
if (FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(FFMPEG_PATH);
  console.info("[merge-vva] ffmpeg:", FFMPEG_PATH);
} else {
  console.warn("[merge-vva] WARNING: no ffmpeg binary found");
}

export interface MergeVideoVoiceAmbientParams {
  clipUrls: string[];
  userId: string;
  /** Voice MP3 URL (Supabase / ElevenLabs). */
  voiceAudioUrl?: string;
  /** Raw voice MP3 bytes — used when URL not provided. */
  voiceBuffer?: Buffer;
  /** Ambient MP3 URL. */
  ambientUrl?: string;
  /** Raw ambient MP3 bytes — used when URL not provided. */
  ambientBuffer?: Buffer;
}

export interface MergeVideoVoiceAmbientResult {
  videoUrl: string;
  durationSeconds: number;
}

async function fetchBuffer(url: string, label: string): Promise<Buffer> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${label} fetch HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error(`${label} returned 0 bytes`);
  return buf;
}

function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) { resolve(0); return; }
      const dur = meta?.format?.duration ?? 0;
      resolve(typeof dur === "number" ? dur : parseFloat(String(dur)) || 0);
    });
  });
}

function escapeConcatPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/'/g, "'\\''");
}

/**
 * Concat clip URLs, mix voice + ambient, upload final MP4 to `renders`.
 * Voice volume 1.1, ambient 0.35 — ambient loops under narration.
 */
export async function mergeVideoVoiceAmbient(
  params: MergeVideoVoiceAmbientParams,
): Promise<MergeVideoVoiceAmbientResult> {
  const { clipUrls, userId, voiceAudioUrl, voiceBuffer, ambientUrl, ambientBuffer } = params;

  if (!clipUrls.length) throw new Error("[merge-vva] no clips to stitch");
  if (!voiceAudioUrl && !voiceBuffer?.length) {
    throw new Error("[merge-vva] voice audio required (URL or buffer)");
  }
  if (!FFMPEG_PATH) throw new Error("[merge-vva] ffmpeg not available");

  const jobId = randomUUID().slice(0, 8);
  const tempDir = join(WORK_DIR, jobId);
  mkdirSync(tempDir, { recursive: true });

  const clipFiles: string[] = [];
  const concatList = join(tempDir, "concat.txt");
  const voicePath = join(tempDir, "voice.mp3");
  const ambientPath = join(tempDir, "ambient.mp3");
  const silentPath = join(tempDir, "silent.mp4");
  const outputPath = join(tempDir, `final_${Date.now()}.mp4`);

  const cleanup = () => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* noop */ }
  };

  try {
    console.log(`[merge-vva] downloading ${clipUrls.length} clips...`);

    const orderedClipFiles: string[] = new Array(clipUrls.length);
    await Promise.all(
      clipUrls.map(async (url, i) => {
        const clipPath = join(tempDir, `clip${i}.mp4`);
        const buf = await fetchBuffer(url, `clip${i}`);
        writeFileSync(clipPath, buf);
        orderedClipFiles[i] = clipPath;
      }),
    );
    clipFiles.push(...orderedClipFiles);

    const listContent = clipFiles.map((f) => `file '${escapeConcatPath(f)}'`).join("\n");
    writeFileSync(concatList, listContent);

    if (voiceBuffer?.length) {
      writeFileSync(voicePath, voiceBuffer);
    } else if (voiceAudioUrl) {
      writeFileSync(voicePath, await fetchBuffer(voiceAudioUrl, "voice"));
    }

    const hasAmbient = !!(ambientBuffer?.length || ambientUrl);
    if (ambientBuffer?.length) {
      writeFileSync(ambientPath, ambientBuffer);
    } else if (ambientUrl) {
      writeFileSync(ambientPath, await fetchBuffer(ambientUrl, "ambient"));
    }

    console.log("[merge-vva] concat clips (silent pass)...");

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatList)
        .inputOptions(["-f", "concat", "-safe", "0"])
        .outputOptions([
          "-c:v", "libx264",
          "-preset", "medium",
          "-crf", "23",
          "-pix_fmt", "yuv420p",
          "-an",
          "-movflags", "+faststart",
        ])
        .output(silentPath)
        .on("error", (err, _s, stderr) => {
          reject(new Error(`concat: ${err.message} ${String(stderr ?? "").slice(-400)}`));
        })
        .on("end", () => resolve())
        .run();
    });

    const videoDur = await probeDuration(silentPath);
    const targetDur = videoDur > 0 ? videoDur : clipUrls.length * 6;

    console.log(`[merge-vva] mixing audio — video=${targetDur.toFixed(1)}s ambient=${hasAmbient}`);

    let finalDurationSec = targetDur;

    await new Promise<void>((resolve, reject) => {
      let lastTs = "";

      const cmd = ffmpeg().input(silentPath);

      if (hasAmbient) {
        cmd
          .input(voicePath)
          .input(ambientPath)
          .inputOptions(["-stream_loop", "-1"]);
      } else {
        cmd.input(voicePath);
      }

      const outputOpts = [
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-map", "0:v:0",
        "-movflags", "+faststart",
        `-t`, targetDur.toFixed(2),
      ];

      if (hasAmbient) {
        outputOpts.push(
          "-filter_complex",
          "[1:a]volume=1.1[voice];[2:a]volume=0.35[ambient];[voice][ambient]amix=inputs=2:duration=first:dropout_transition=2[mix]",
          "-map", "[mix]",
          "-c:a", "aac",
          "-b:a", "192k",
        );
      } else {
        outputOpts.push(
          "-af", "volume=1.1",
          "-map", "1:a:0",
          "-c:a", "aac",
          "-b:a", "192k",
        );
      }

      cmd
        .outputOptions(outputOpts)
        .output(outputPath)
        .on("stderr", (line: string) => {
          const m = line.match(/time=(\d+:\d+:\d+\.?\d*)/);
          if (m) lastTs = m[1];
        })
        .on("error", (err, _s, stderr) => {
          reject(new Error(`mix: ${err.message} ${String(stderr ?? "").slice(-400)}`));
        })
        .on("end", () => {
          if (lastTs) {
            const [h, m, s] = lastTs.split(":").map(Number);
            finalDurationSec = h * 3600 + m * 60 + s;
          }
          resolve();
        })
        .run();
    });

    if (!existsSync(outputPath) || !readFileSync(outputPath).length) {
      throw new Error("[merge-vva] ffmpeg produced no output");
    }

    const fileBuffer = readFileSync(outputPath);
    const storagePath = `renders/${userId}/final/${Date.now()}-${jobId}.mp4`;

    const { data, error } = await supabaseAdmin.storage
      .from("renders")
      .upload(storagePath, fileBuffer, { contentType: "video/mp4", upsert: true });

    if (error) throw new Error(`[merge-vva] upload failed: ${error.message}`);

    const { data: { publicUrl } } = supabaseAdmin.storage.from("renders").getPublicUrl(data.path);

    console.log(`[MERGE_OK] bucket=renders path=${storagePath} dur=${finalDurationSec.toFixed(1)}s`);

    return {
      videoUrl: publicUrl,
      durationSeconds: finalDurationSec || targetDur,
    };
  } finally {
    cleanup();
  }
}