/**
 * Shared (non-UI) utility to merge a video with a voiceover audio track.
 * Used by merge-video-audio API route and as fallback in cinematic flows.
 *
 * Audio drives duration: video loops (-stream_loop -1) so the full voiceover
 * plays even when the video clip is shorter than the narration.
 * Must re-encode video (libx264) because stream-copy breaks with looping.
 */

import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { writeFileSync, readFileSync, unlinkSync, existsSync, copyFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { execSync } from "child_process";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Mirror the same /tmp copy trick used in the cinematic sequence route so we
// get an executable binary on Vercel's read-only serverless filesystem.
function resolveFfmpeg(): void {
  const tmp = "/tmp/ffmpeg_merge_audio";
  if (ffmpegStatic && process.platform === "linux") {
    try {
      if (!existsSync(tmp)) {
        copyFileSync(ffmpegStatic, tmp);
        execSync(`chmod 755 "${tmp}"`);
      }
      execSync(`"${tmp}" -version 2>&1`, { timeout: 4000 });
      ffmpeg.setFfmpegPath(tmp);
      return;
    } catch {}
  }
  if (ffmpegStatic) {
    try {
      execSync(`"${ffmpegStatic}" -version 2>&1`, { timeout: 4000 });
      ffmpeg.setFfmpegPath(ffmpegStatic);
    } catch {}
  }
}
resolveFfmpeg();

async function fetchBuffer(url: string, timeoutMs = 60000, label = "media"): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error(`${label} 0 bytes`);
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

export async function mergeVideoWithAudio(
  userId: string,
  videoUrl: string,
  audioUrl?: string | null,
  audioBase64?: string | null,
  ambientBuffer?: Buffer | null,
): Promise<{ video_url: string; duration_seconds: number }> {
  const id = randomUUID();
  const tmpDir = tmpdir();
  const videoPath   = join(tmpDir, `v-${id}.mp4`);
  const audioPath   = join(tmpDir, `a-${id}.mp3`);
  const ambientPath = join(tmpDir, `amb-${id}.mp3`);
  const outputPath  = join(tmpDir, `out-${id}.mp4`);

  try {
    const videoBytes = await fetchBuffer(videoUrl, 60000, "video");
    writeFileSync(videoPath, videoBytes);

    if (audioBase64 && audioBase64.length > 0) {
      writeFileSync(audioPath, Buffer.from(audioBase64, "base64"));
    } else if (audioUrl) {
      const audioBytes = await fetchBuffer(audioUrl, 60000, "audio");
      writeFileSync(audioPath, audioBytes);
    } else {
      throw new Error("No audio data provided");
    }

    const hasAmbient = ambientBuffer && ambientBuffer.length > 1000;
    if (hasAmbient) writeFileSync(ambientPath, ambientBuffer);

    let finalDurationSec = 0;
    await new Promise<void>((resolve, reject) => {
      let lastTs = "";

      // Build the FFmpeg command:
      // Input 0: video  (looped)
      // Input 1: voiceover  (drives output duration via -shortest)
      // Input 2: ambient    (optional, looped, mixed at -18dB under voiceover)
      const cmd = ffmpeg()
        .input(videoPath)
        .inputOptions(["-stream_loop", "-1"])  // loop video
        .input(audioPath);                     // voiceover

      if (hasAmbient) {
        cmd
          .input(ambientPath)
          .inputOptions(["-stream_loop", "-1"]);  // loop ambient to match duration
      }

      const outputOpts = [
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-map", "0:v:0",
        "-movflags", "+faststart",
        "-shortest",  // stop when voiceover (input 1) ends
      ];

      if (hasAmbient) {
        // Mix voiceover (full volume) + ambient (-18dB) into a single stereo track
        outputOpts.push(
          "-filter_complex",
          "[1:a]volume=1.0[vo];[2:a]volume=0.18[amb];[vo][amb]amix=inputs=2:duration=shortest[aout]",
          "-map", "[aout]",
          "-c:a", "aac",
          "-b:a", "192k",
        );
        console.log("[merge] mixing voiceover + ambient audio");
      } else {
        outputOpts.push(
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
        .on("end", () => {
          if (lastTs) {
            const [h, m, s] = lastTs.split(":").map(Number);
            finalDurationSec = h * 3600 + m * 60 + s;
          }
          resolve();
        })
        .on("error", (err) => reject(new Error(`FFmpeg: ${err.message}`)))
        .run();
    });

    if (!existsSync(outputPath) || !readFileSync(outputPath).length) {
      throw new Error("merge produced no output");
    }

    const buffer = readFileSync(outputPath);
    const storagePath = `final/${Date.now()}-${id.slice(0, 8)}.mp4`;
    const { data: upData, error: upErr } = await supabaseAdmin.storage
      .from("renders")
      .upload(storagePath, buffer, { contentType: "video/mp4", upsert: true });
    if (upErr) {
      throw new Error(`renders bucket upload failed: ${upErr.message}`);
    }
    const { data: { publicUrl } } = supabaseAdmin.storage.from("renders").getPublicUrl(upData.path);
    console.log(`[MERGE_OK] bucket=renders path=${storagePath} user=${userId}`);
    return { video_url: publicUrl, duration_seconds: parseFloat(finalDurationSec.toFixed(2)) || 30 };
  } finally {
    [videoPath, audioPath, ambientPath, outputPath].forEach(p => { try { unlinkSync(p); } catch {} });
  }
}
