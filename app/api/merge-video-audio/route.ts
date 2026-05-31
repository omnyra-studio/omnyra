import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import { tmpdir } from "os";
import { join } from "path";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { randomUUID } from "crypto";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const maxDuration = 300;

// ffprobe wrapped with hard timeout so corrupt media never hangs the route
function probeWithTimeout(filePath: string, label: string, timeoutMs = 12_000): Promise<number> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`[merge-video-audio:ffprobe] TIMEOUT probing ${label} after ${timeoutMs}ms`);
      resolve(0);
    }, timeoutMs);
    ffmpeg.ffprobe(filePath, (err, meta) => {
      clearTimeout(timer);
      const dur = meta?.format?.duration ?? 0;
      if (err) console.warn(`[merge-video-audio:ffprobe] ERROR on ${label}: ${err.message}`);
      resolve(typeof dur === "number" ? dur : parseFloat(String(dur)) || 0);
    });
  });
}

// fetch with AbortController timeout
async function fetchWithTimeout(url: string, timeoutMs: number, label: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`${label}: HTTP ${res.status} — ${url.substring(0, 120)}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error(`${label}: 0 bytes — URL may be expired`);
    return buf;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`${label}: download timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { video_url?: string; audio_url?: string; audio_base64?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { video_url, audio_url, audio_base64 } = body;

  if (!video_url || (!audio_url && !audio_base64)) {
    return Response.json({ error: "video_url and audio are required" }, { status: 400 });
  }

  // Guard against excessively large base64 payloads (~75MB limit → ~100MB decoded)
  if (audio_base64 && audio_base64.length > 100_000_000) {
    return Response.json({ error: "audio_base64 too large (max 75MB)" }, { status: 413 });
  }

  const id = randomUUID();
  const tmpDir = tmpdir();
  const videoPath = join(tmpDir, `video-${id}.mp4`);
  const audioPath = join(tmpDir, `audio-${id}.mp3`);
  const outputPath = join(tmpDir, `output-${id}.mp4`);

  try {
    console.log(`[merge-video-audio] START video=${video_url.substring(0, 80)} hasBase64=${!!audio_base64} hasAudioUrl=${!!audio_url}`);

    // Download video
    const videoBytes = await fetchWithTimeout(video_url, 60_000, "video");
    writeFileSync(videoPath, videoBytes);
    console.log(`[merge-video-audio] video downloaded size=${videoBytes.length}bytes`);

    // Write audio (base64 or download)
    if (audio_base64) {
      const audioBytes = Buffer.from(audio_base64, "base64");
      writeFileSync(audioPath, audioBytes);
      console.log(`[merge-video-audio] audio from base64 size=${audioBytes.length}bytes`);
    } else {
      const audioBytes = await fetchWithTimeout(audio_url!, 60_000, "audio");
      writeFileSync(audioPath, audioBytes);
      console.log(`[merge-video-audio] audio downloaded size=${audioBytes.length}bytes`);
    }

    // PHASE 6: probe video and audio before merge
    const videoDurRaw = await probeWithTimeout(videoPath, "video");
    const audioDurRaw = await probeWithTimeout(audioPath, "audio");
    console.log(`[PHASE6] VIDEO_DURATION=${videoDurRaw}s AUDIO_DURATION=${audioDurRaw}s`);
    console.log(`[PHASE6] video_shorter_than_audio=${videoDurRaw < audioDurRaw} delta=${(audioDurRaw - videoDurRaw).toFixed(2)}s`);

    // Merge with FFmpeg
    console.log("[merge-video-audio] starting FFmpeg merge");
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions([
          "-c:v", "copy",
          "-c:a", "aac",
          "-map", "0:v:0",
          "-map", "1:a:0",
        ])
        .output(outputPath)
        .on("stderr", (line: string) => console.log("[merge-video-audio:ffmpeg:stderr]", line))
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(new Error(`FFmpeg merge failed: ${err.message}`)))
        .run();
    });

    if (!existsSync(outputPath)) {
      throw new Error("FFmpeg merge completed but produced no output file — check stderr above");
    }

    // PHASE 6: probe output after merge
    const finalDur = await probeWithTimeout(outputPath, "output");
    console.log(`[PHASE6] FINAL_DURATION=${finalDur}s`);

    const buffer = readFileSync(outputPath);
    if (!buffer.length) throw new Error("FFmpeg output is 0 bytes");
    console.log(`[merge-video-audio] SUCCESS size=${buffer.length}bytes duration=${finalDur}s`);

    return new Response(buffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": 'attachment; filename="omnyra-final.mp4"',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[merge-video-audio] FAILED:", msg);
    return Response.json({ error: msg }, { status: 500 });
  } finally {
    for (const p of [videoPath, audioPath, outputPath]) {
      try { unlinkSync(p); } catch { /* already cleaned */ }
    }
  }
}
