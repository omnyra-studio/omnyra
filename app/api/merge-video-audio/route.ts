import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import { tmpdir } from "os";
import { join } from "path";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { randomUUID } from "crypto";
import { supabaseAdmin, cleanEnv } from "@/lib/supabase/admin";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const maxDuration = 300;

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
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
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

  if (audio_base64 && audio_base64.length > 100_000_000) {
    return Response.json({ error: "audio_base64 too large (max 75MB)" }, { status: 413 });
  }

  const id       = randomUUID();
  const tmpDir   = tmpdir();
  const videoPath  = join(tmpDir, `mv-video-${id}.mp4`);
  const audioPath  = join(tmpDir, `mv-audio-${id}.mp3`);
  const outputPath = join(tmpDir, `mv-output-${id}.mp4`);

  try {
    console.log(`[merge-video-audio] START user=${user.id} video=${video_url.substring(0, 80)} hasBase64=${!!audio_base64}`);

    // ── Download inputs in parallel ──────────────────────────────────────────
    const [videoBytes, audioBytes] = await Promise.all([
      fetchWithTimeout(video_url, 60_000, "video"),
      audio_base64
        ? Promise.resolve(Buffer.from(audio_base64, "base64"))
        : fetchWithTimeout(audio_url!, 60_000, "audio"),
    ]);

    writeFileSync(videoPath, videoBytes);
    writeFileSync(audioPath, audioBytes);
    console.log(`[merge-video-audio] downloaded video=${videoBytes.length}b audio=${audioBytes.length}b`);

    // ── FFmpeg merge — -shortest stops at the shorter stream (video drives duration) ─
    // Not using ffprobe to avoid the "ffprobe not found" failure on Vercel.
    // Instead, parse the HH:MM:SS.ms timestamp from ffmpeg's own stderr output.
    let finalDurationSec = 0;
    await new Promise<void>((resolve, reject) => {
      let lastTimestamp = "";

      ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions([
          "-c:v", "copy",      // stream-copy video — no re-encode, instant
          "-c:a", "aac",
          "-b:a", "192k",
          "-map", "0:v:0",
          "-map", "1:a:0",
          "-shortest",         // CRITICAL: stop when shorter stream ends — prevents audio overrun
          "-movflags", "+faststart",
        ])
        .output(outputPath)
        .on("stderr", (line: string) => {
          console.log("[merge-video-audio:ffmpeg]", line);
          const m = line.match(/time=(\d+:\d+:\d+\.?\d*)/);
          if (m) lastTimestamp = m[1];
        })
        .on("end", () => {
          if (lastTimestamp) {
            const [h, m, s] = lastTimestamp.split(":").map(Number);
            finalDurationSec = h * 3600 + m * 60 + s;
          }
          console.log(`[merge-video-audio] FFmpeg done — final_duration=${finalDurationSec.toFixed(2)}s`);
          resolve();
        })
        .on("error", (err: Error) => reject(new Error(`FFmpeg merge failed: ${err.message}`)))
        .run();
    });

    if (!existsSync(outputPath)) {
      throw new Error("FFmpeg merge completed but produced no output file");
    }

    const buffer = readFileSync(outputPath);
    if (!buffer.length) throw new Error("FFmpeg output is 0 bytes");
    console.log(`[merge-video-audio] SUCCESS size=${buffer.length}b duration=${finalDurationSec.toFixed(2)}s`);

    // ── Upload to Supabase storage → permanent URL ───────────────────────────
    // Permanent URL required for reliable downloads — blob URLs are ephemeral
    // and can't be force-downloaded cross-origin.
    const storagePath = `renders/${user.id}/merged/${id}.mp4`;
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("videos")
      .upload(storagePath, buffer, { contentType: "video/mp4", upsert: true });

    if (uploadErr) {
      // Fallback: return binary blob (old behavior) — download will still work via handleDownload
      console.warn("[merge-video-audio] Supabase upload failed (returning blob):", uploadErr.message);
      return new Response(buffer, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": 'attachment; filename="omnyra-final.mp4"',
        },
      });
    }

    const { data: { publicUrl } } = supabaseAdmin.storage.from("videos").getPublicUrl(storagePath);
    console.log(`[merge-video-audio] uploaded → ${publicUrl.substring(0, 80)}`);

    return Response.json({
      video_url:        publicUrl,
      merged_url:       publicUrl,
      duration_seconds: parseFloat(finalDurationSec.toFixed(2)),
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
