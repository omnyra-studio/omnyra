/**
 * Smart Motion Engine — DISABLED when FORCE_SEEDANCE is true.
 * Use Seedance via ElevenLabs instead.
 *
 * Applies lightweight cinematic motion effects to static images using FFmpeg.
 * Target: <2 seconds per scene. Zero AI generation cost.
 *
 * Effects implement Ken Burns, pan, tilt, dolly zoom, parallax, and light
 * movement using the FFmpeg zoompan + overlay filter complex.
 */

import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import { tmpdir } from "os";
import { join, extname } from "path";
import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { randomUUID } from "crypto";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// ── Types ────────────────────────────────────────────────────────────────────

export type SmartMotionEffect =
  | "push_in"          // slow zoom toward center
  | "pull_out"         // slow zoom away from center
  | "pan_left"         // horizontal pan left
  | "pan_right"        // horizontal pan right
  | "tilt_up"          // vertical pan up
  | "tilt_down"        // vertical pan down
  | "dolly_zoom"       // zoom in while panning out (Vertigo)
  | "parallax"         // layered depth shift
  | "dynamic_crop"     // shift crop window + subtle zoom
  | "light_movement"   // brightness pulse with slow pan
  | "focus_pull"       // slight blur-to-sharp with zoom
  | "motion_blur";     // directional motion blur transition

export interface SmartMotionInput {
  imageUrl:    string;
  effect:      SmartMotionEffect;
  durationSec: number;   // target scene duration (5–10s)
  outputFps?:  number;   // default 24
}

// ── Effect → zoompan filter ──────────────────────────────────────────────────

const TARGET_W = 720;
const TARGET_H = 1280;
const SCALE_FACTOR = 1.08; // slightly over-scale so motion has room

function zpFilter(params: {
  zoom: string;
  x: string;
  y: string;
  d: number;  // duration in frames
  s: string;
}): string {
  return (
    `zoompan=zoom='${params.zoom}':x='${params.x}':y='${params.y}'` +
    `:d=${params.d}:s=${params.s}:fps=24`
  );
}

function buildFilterComplex(effect: SmartMotionEffect, durationSec: number): string {
  const fps   = 24;
  const d     = Math.round(durationSec * fps);
  const s     = `${TARGET_W}x${TARGET_H}`;

  // Fractional progress variable: t/d where t = frame index (0-based)
  // All zoompan expressions use 'on' = output frame number, 'd' = total frames

  switch (effect) {
    case "push_in":
      return zpFilter({
        zoom: `min(zoom+0.0003,${SCALE_FACTOR})`,
        x:    "iw/2-(iw/zoom/2)",
        y:    "ih/2-(ih/zoom/2)",
        d,
        s,
      });

    case "pull_out":
      return zpFilter({
        zoom: `if(eq(on,1),${SCALE_FACTOR},max(zoom-0.0003,1.0))`,
        x:    "iw/2-(iw/zoom/2)",
        y:    "ih/2-(ih/zoom/2)",
        d,
        s,
      });

    case "pan_left":
      return zpFilter({
        zoom: "1.04",
        x:    `if(eq(on,1),0,x+0.5)`,
        y:    "ih/2-(ih/zoom/2)",
        d,
        s,
      });

    case "pan_right":
      return zpFilter({
        zoom: "1.04",
        x:    `if(eq(on,1),iw*0.04,max(x-0.5,0))`,
        y:    "ih/2-(ih/zoom/2)",
        d,
        s,
      });

    case "tilt_up":
      return zpFilter({
        zoom: "1.04",
        x:    "iw/2-(iw/zoom/2)",
        y:    `if(eq(on,1),ih*0.04,max(y-0.5,0))`,
        d,
        s,
      });

    case "tilt_down":
      return zpFilter({
        zoom: "1.04",
        x:    "iw/2-(iw/zoom/2)",
        y:    `if(eq(on,1),0,y+0.5)`,
        d,
        s,
      });

    case "dolly_zoom":
      // zoom in while panning left slightly (Hitchcock effect lite)
      return zpFilter({
        zoom: `min(zoom+0.0004,${SCALE_FACTOR})`,
        x:    `if(eq(on,1),iw*0.03,max(x-0.2,0))`,
        y:    "ih/2-(ih/zoom/2)",
        d,
        s,
      });

    case "parallax":
      // dual-axis drift: up-right drift
      return zpFilter({
        zoom: "1.06",
        x:    `if(eq(on,1),0,x+0.3)`,
        y:    `if(eq(on,1),ih*0.04,max(y-0.3,0))`,
        d,
        s,
      });

    case "dynamic_crop":
      // shift crop + subtle zoom
      return zpFilter({
        zoom: `min(zoom+0.0002,1.06)`,
        x:    `if(eq(on,1),iw*0.02,x+0.2)`,
        y:    `if(eq(on,1),ih*0.02,y+0.15)`,
        d,
        s,
      });

    case "light_movement":
      // pan right with slight zoom (light sweep feel)
      return zpFilter({
        zoom: "1.03",
        x:    `if(eq(on,1),iw*0.02,max(x-0.4,0))`,
        y:    "ih/2-(ih/zoom/2)",
        d,
        s,
      });

    case "focus_pull":
      // push in with slightly stronger zoom start
      return zpFilter({
        zoom: `if(eq(on,1),1.08,min(zoom-0.0002,${SCALE_FACTOR}))`,
        x:    "iw/2-(iw/zoom/2)",
        y:    "ih/2-(ih/zoom/2)",
        d,
        s,
      });

    case "motion_blur":
      // subtle horizontal pan — actual blur applied via boxblur on top
      return zpFilter({
        zoom: "1.04",
        x:    `if(eq(on,1),0,x+0.6)`,
        y:    "ih/2-(ih/zoom/2)",
        d,
        s,
      });

    default:
      return zpFilter({
        zoom: `min(zoom+0.0002,${SCALE_FACTOR})`,
        x:    "iw/2-(iw/zoom/2)",
        y:    "ih/2-(ih/zoom/2)",
        d,
        s,
      });
  }
}

// ── Effect selection helpers ─────────────────────────────────────────────────

const SCENE_TYPE_EFFECTS: Record<string, SmartMotionEffect[]> = {
  quote:       ["push_in", "pull_out", "light_movement"],
  cta:         ["push_in", "dolly_zoom", "pan_right"],
  educational: ["pan_left", "pan_right", "tilt_up"],
  background:  ["parallax", "pan_left", "pan_right", "light_movement"],
  transition:  ["dynamic_crop", "motion_blur", "focus_pull"],
  default:     ["push_in", "pull_out", "pan_left", "pan_right", "tilt_up", "light_movement"],
};

export function pickEffect(sceneType?: string, sceneIndex?: number): SmartMotionEffect {
  const pool = SCENE_TYPE_EFFECTS[sceneType ?? "default"] ?? SCENE_TYPE_EFFECTS.default;
  const idx  = (sceneIndex ?? 0) % pool.length;
  return pool[idx];
}

// ── Core generator ────────────────────────────────────────────────────────────

export async function generateSmartMotionClip(input: SmartMotionInput): Promise<Buffer> {
  const { FORCE_SEEDANCE } = await import("@/lib/video-provider");
  if (FORCE_SEEDANCE) {
    throw new Error("smart_motion disabled — FORCE_SEEDANCE is true. Use Seedance via ElevenLabs.");
  }

  const { imageUrl, effect, durationSec } = input;

  // Download source image
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`smart-motion: image fetch ${imgRes.status}`);
  const imgBuf = Buffer.from(await imgRes.arrayBuffer());

  const tmpDir  = tmpdir();
  const id      = randomUUID();
  const imgExt  = extname(new URL(imageUrl).pathname) || ".jpg";
  const imgPath = join(tmpDir, `sm-src-${id}${imgExt}`);
  const outPath = join(tmpDir, `sm-out-${id}.mp4`);

  writeFileSync(imgPath, imgBuf);

  const filterStr = buildFilterComplex(effect, Math.max(4, Math.min(10, durationSec)));

  await new Promise<void>((resolve, reject) => {
    let cmd = ffmpeg(imgPath)
      .loop(1)
      .duration(durationSec)
      .videoFilters(filterStr)
      .outputOptions([
        "-c:v libx264",
        "-preset ultrafast",
        "-crf 23",
        "-pix_fmt yuv420p",
        "-an",
        `-t ${durationSec}`,
        `-r 24`,
      ])
      .output(outPath);

    if (effect === "motion_blur") {
      cmd = cmd.videoFilters([filterStr, "boxblur=2:1"]);
    }

    cmd
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(new Error(`smart-motion ffmpeg: ${err.message}`)))
      .run();
  });

  const outBuf = readFileSync(outPath);

  try { unlinkSync(imgPath); } catch { /* non-fatal */ }
  try { unlinkSync(outPath); } catch { /* non-fatal */ }

  console.log(`[smart-motion] effect=${effect} duration=${durationSec}s output=${outBuf.length} bytes`);
  return outBuf;
}
