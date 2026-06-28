/**
 * Extract last frame of an MP4 video as a Supabase-hosted JPEG.
 * Used to chain scene 0's last frame as scene 1..N first-frame reference.
 * Non-fatal: returns null on any failure.
 */

import * as fs   from "fs";
import * as os   from "os";
import * as path from "path";
import ffmpeg    from "fluent-ffmpeg";
import { createClient } from "@supabase/supabase-js";

let ffmpegReady = false;

function ensureFfmpeg(): void {
  if (ffmpegReady) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const bin = require("ffmpeg-static") as string | null;
    if (bin) { ffmpeg.setFfmpegPath(bin); ffmpegReady = true; }
  } catch { /* ffmpeg-static not available */ }
}

export async function extractLastFrame(
  videoUrl:   string,
  userId:     string,
  clipIndex:  number,
): Promise<string | null> {
  const label = `[LAST_FRAME clip=${clipIndex + 1}]`;
  try {
    ensureFfmpeg();

    const videoRes = await fetch(videoUrl, { signal: AbortSignal.timeout(20_000) });
    if (!videoRes.ok) { console.warn(`${label} fetch ${videoRes.status}`); return null; }

    const buf      = Buffer.from(await videoRes.arrayBuffer());
    const tmpDir   = os.tmpdir();
    const vidPath  = path.join(tmpDir, `omnyra-lf-vid-${clipIndex}-${Date.now()}.mp4`);
    const framePath = path.join(tmpDir, `omnyra-lf-frame-${clipIndex}-${Date.now()}.jpg`);

    fs.writeFileSync(vidPath, buf);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(vidPath)
        .inputOptions(["-sseof", "-1"])
        .outputOptions(["-frames:v", "1", "-q:v", "2", "-update", "1"])
        .output(framePath)
        .on("end",   () => resolve())
        .on("error", (e: Error) => reject(e))
        .run();
    });

    if (!fs.existsSync(framePath)) { console.warn(`${label} no frame produced`); return null; }

    const frameBuffer = fs.readFileSync(framePath);
    try { fs.unlinkSync(vidPath); fs.unlinkSync(framePath); } catch { /* ignore */ }

    const supabase    = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const storagePath = `${userId || "anon"}/last-frames/${Date.now()}-clip${clipIndex}.jpg`;
    const { error }   = await supabase.storage
      .from("renders")
      .upload(storagePath, frameBuffer, { contentType: "image/jpeg", upsert: true });

    if (error) { console.warn(`${label} upload failed: ${error.message}`); return null; }

    const { data: { publicUrl } } = supabase.storage.from("renders").getPublicUrl(storagePath);
    console.log(`${label} -> ${publicUrl.slice(0, 70)}`);
    return publicUrl;
  } catch (err) {
    console.warn(`${label} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}
