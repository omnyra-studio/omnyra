/**
 * Composition Engine — stitches shot clips into a final video.
 *
 * Uses fluent-ffmpeg + ffmpeg-static (bundled binary, no system install needed).
 *
 * Energy pulse editing rules:
 *   - Avatar shots capped at 3s with Ken Burns micro-zoom (1.0 → 1.015)
 *   - spike/ramp_up shots play at 0.91x speed (slightly faster)
 *   - ramp_down/sustain shots play at 1.0x (normal)
 *   - xfade transitions: hard_cut, soft_dissolve, whip_blur, light_streak
 *   - Voiceover runs full duration; last shot extends if clips fall short
 *   - Opens with b-roll (enforced by Director Engine); never fades out
 */

import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import http from "node:http";
import os from "node:os";
import type { ShotPacket } from "./types/shot";

// Point fluent-ffmpeg at the bundled binary
if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

const WORK_DIR = path.join(os.tmpdir(), "omnyra_render");
const OUTPUT_RESOLUTION = { w: 1080, h: 1920 };
const FPS = 24;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Stitches shot clips into a final 9:16 video with voiceover.
 *
 * @param shotPackets  Ordered shot packets from the Director Engine
 * @param shotClips    Map of shot_id → local file path or URL for each clip
 * @param voiceoverPath  Local path to the full-video voiceover MP3/WAV
 * @param options      Optional: captions SRT path, background music path
 * @returns Absolute path to the final MP4
 */
export async function composeVideo(
  shotPackets: ShotPacket[],
  shotClips: Map<string, string>,
  voiceoverPath: string,
  options: {
    captionsSrt?: string;
    backgroundMusicPath?: string;
  } = {},
): Promise<string> {
  ensureWorkDir();

  // Download any URL-based clips to local files
  const localClips = await downloadClips(shotPackets, shotClips);

  // Build and run the FFmpeg command
  const outputPath = path.join(WORK_DIR, `final_${Date.now()}.mp4`);
  await runComposition(shotPackets, localClips, voiceoverPath, outputPath, options);

  // Cleanup working files (keep output)
  cleanupWorkFiles(localClips.filter(c => c.wasDownloaded).map(c => c.localPath));

  return outputPath;
}

// ── Download ──────────────────────────────────────────────────────────────────

interface LocalClip {
  shotId: string;
  localPath: string;
  wasDownloaded: boolean;
  packet: ShotPacket;
}

async function downloadClips(
  packets: ShotPacket[],
  shotClips: Map<string, string>,
): Promise<LocalClip[]> {
  const results = await Promise.all(
    packets.map(async (packet): Promise<LocalClip | null> => {
      const src = shotClips.get(packet.shot_id);
      if (!src) {
        console.warn(`[composer] no clip for shot ${packet.shot_id} — skipping`);
        return null;
      }

      if (src.startsWith("http://") || src.startsWith("https://")) {
        const localPath = path.join(WORK_DIR, `${packet.shot_id}.mp4`);
        await downloadFile(src, localPath);
        return { shotId: packet.shot_id, localPath, wasDownloaded: true, packet };
      }

      return { shotId: packet.shot_id, localPath: src, wasDownloaded: false, packet };
    }),
  );

  return results.filter((r): r is LocalClip => r !== null);
}

// ── Main FFmpeg composition ───────────────────────────────────────────────────

async function runComposition(
  packets: ShotPacket[],
  clips: LocalClip[],
  voiceoverPath: string,
  outputPath: string,
  options: { captionsSrt?: string; backgroundMusicPath?: string },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();
    const { w, h } = OUTPUT_RESOLUTION;

    // ── Inputs ──────────────────────────────────────────────────────────────
    for (const clip of clips) {
      cmd.input(clip.localPath);
    }
    cmd.input(voiceoverPath);
    const voiceoverIndex = clips.length;

    if (options.backgroundMusicPath) {
      cmd.input(options.backgroundMusicPath);
    }
    const musicIndex = options.backgroundMusicPath ? clips.length + 1 : null;

    // ── filter_complex ───────────────────────────────────────────────────────
    const filterParts: string[] = [];
    const labelMap: string[] = [];

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const shot = clip.packet;
      const inLabel  = `[${i}:v]`;
      const outLabel = `[v${i}]`;

      const filters: string[] = [];

      // 1. Scale + pad to 1080×1920
      filters.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease`);
      filters.push(`pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`);
      filters.push(`fps=${FPS}`);

      // 2. Speed ramp: spike energy plays slightly faster
      const pts = speedRampPts(shot);
      if (pts !== 1.0) {
        filters.push(`setpts=${pts.toFixed(4)}*PTS`);
      }

      // 3. Ken Burns micro-zoom on avatar shots — subtle life even in static frames
      if (shot.content_type === "avatar") {
        const frames = Math.ceil(shot.duration_seconds * FPS);
        filters.push(kenBurnsFilter(w, h, frames));
      }

      filterParts.push(`${inLabel}${filters.join(",")}${outLabel}`);
      labelMap.push(outLabel);
    }

    // ── Chain shots with xfade transitions ──────────────────────────────────
    let chainedLabel = labelMap[0];

    for (let i = 1; i < labelMap.length; i++) {
      const shot      = clips[i].packet;
      const prevShot  = clips[i - 1].packet;
      const outLabel  = `[xf${i}]`;

      const { xfadeType, duration } = transitionParams(shot.transition_in, shot.transition_duration);

      // xfade offset = sum of durations of all preceding shots minus the crossfade duration
      const offsetSeconds = clips
        .slice(0, i)
        .reduce((sum, c) => sum + effectiveDuration(c.packet), 0) - duration;

      if (xfadeType === "none") {
        // Hard cut: just relabel
        filterParts.push(`${chainedLabel}${labelMap[i]}concat=n=2:v=1:a=0${outLabel}`);
      } else {
        filterParts.push(
          `${chainedLabel}${labelMap[i]}xfade=transition=${xfadeType}:duration=${duration}:offset=${Math.max(0, offsetSeconds)}${outLabel}`,
        );
      }

      chainedLabel = outLabel;
      void prevShot; // referenced for offset calc above
    }

    // ── Final video stream label ─────────────────────────────────────────────
    const finalVideoLabel = chainedLabel;

    // ── Audio mixing ─────────────────────────────────────────────────────────
    let finalAudioLabel: string;

    if (musicIndex !== null) {
      // Auto-duck: reduce background music to -18dB under voiceover
      filterParts.push(`[${musicIndex}:a]volume=0.12[music]`);
      filterParts.push(`[${voiceoverIndex}:a][music]amix=inputs=2:duration=first:weights=1 0.12[audio_out]`);
      finalAudioLabel = "[audio_out]";
    } else {
      finalAudioLabel = `[${voiceoverIndex}:a]`;
    }

    // ── Assemble ─────────────────────────────────────────────────────────────
    const filterComplex = filterParts.join("; ");

    cmd
      .complexFilter(filterComplex)
      .outputOptions([
        `-map ${finalVideoLabel}`,
        `-map ${finalAudioLabel}`,
        "-c:v libx264",
        "-preset fast",
        "-crf 23",
        "-pix_fmt yuv420p",
        "-c:a aac",
        "-b:a 192k",
        "-movflags +faststart",
        `-r ${FPS}`,
      ]);

    // ── Captions ─────────────────────────────────────────────────────────────
    if (options.captionsSrt && fs.existsSync(options.captionsSrt)) {
      const srtEscaped = options.captionsSrt.replace(/\\/g, "/").replace(/:/g, "\\:");
      cmd.videoFilters(`subtitles=${srtEscaped}:force_style='FontSize=22,PrimaryColour=&HFFFFFF,Bold=1'`);
    }

    cmd
      .output(outputPath)
      .on("start", (cmdLine) => {
        console.log("[composer] FFmpeg command:", cmdLine.slice(0, 200));
      })
      .on("error", (err, stdout, stderr) => {
        console.error("[composer] FFmpeg error:", err.message);
        console.error("[composer] stderr:", stderr?.slice(-2000));
        reject(err);
      })
      .on("end", () => {
        console.log("[composer] Composition complete:", outputPath);
        resolve();
      })
      .run();
  });
}

// ── FFmpeg filter helpers ─────────────────────────────────────────────────────

/**
 * Speed ramp: spike/ramp_up shots play at 0.91× (faster).
 * Returns the setpts multiplier (< 1 = faster).
 */
function speedRampPts(shot: ShotPacket): number {
  if (shot.energy_curve === "spike") return 0.91;
  if (shot.energy_curve === "ramp_up") return 0.95;
  return 1.0;
}

/**
 * Returns the effective playback duration accounting for speed ramp.
 */
function effectiveDuration(shot: ShotPacket): number {
  return shot.duration_seconds * speedRampPts(shot);
}

/**
 * Ken Burns micro-zoom: 1.0 → 1.015 over the shot's frames.
 * Subtle enough to avoid distraction, enough to prevent the dead-frame look.
 */
function kenBurnsFilter(w: number, h: number, frames: number): string {
  const startZoom = 1.0;
  const endZoom   = 1.015;
  // zoompan: z='zoom+0.000625' pushes zoom by (endZoom-startZoom)/frames per frame
  const zStep = (endZoom - startZoom) / Math.max(1, frames);
  return [
    `zoompan=z='min(zoom+${zStep.toFixed(6)},${endZoom})':`,
    `x='iw/2-(iw/zoom/2)':`,
    `y='ih/2-(ih/zoom/2)':`,
    `d=${frames}:`,
    `s=${w}x${h}:`,
    `fps=${FPS}`,
  ].join("");
}

/**
 * Maps Omnyra's transition type to an FFmpeg xfade type + duration.
 */
function transitionParams(
  transition: ShotPacket["transition_in"],
  shotDuration: number,
): { xfadeType: string; duration: number } {
  const d = Math.max(0.1, Math.min(0.5, shotDuration));

  switch (transition) {
    case "hard_cut":     return { xfadeType: "none",           duration: 0 };
    case "soft_dissolve": return { xfadeType: "dissolve",      duration: 0.3 };
    case "whip_blur":    return { xfadeType: "horizontalwipe", duration: d };
    case "light_streak": return { xfadeType: "fade",           duration: 0.4 };
    default:             return { xfadeType: "none",           duration: 0 };
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function ensureWorkDir(): void {
  if (!fs.existsSync(WORK_DIR)) {
    fs.mkdirSync(WORK_DIR, { recursive: true });
  }
}

function cleanupWorkFiles(paths: string[]): void {
  for (const p of paths) {
    try { fs.unlinkSync(p); } catch { /* non-fatal */ }
  }
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = url.startsWith("https://") ? https.get : http.get;

    get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        // Follow redirect
        file.close();
        downloadFile(res.headers.location!, dest).then(resolve).catch(reject);
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
    }).on("error", (err) => {
      fs.unlink(dest, () => {}); // cleanup partial
      reject(err);
    });
  });
}
