import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import { tmpdir } from "os";
import { join } from "path";
import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { randomUUID } from "crypto";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const maxDuration = 300;

export async function POST(req: Request) {
  const { video_url, audio_url, audio_base64 } = await req.json();

  if (!video_url || (!audio_url && !audio_base64)) {
    return Response.json({ error: "video_url and audio are required" }, { status: 400 });
  }

  const id = randomUUID();
  const tmpDir = tmpdir();
  const videoPath = join(tmpDir, `video-${id}.mp4`);
  const audioPath = join(tmpDir, `audio-${id}.mp3`);
  const outputPath = join(tmpDir, `output-${id}.mp4`);

  try {
    // Download video to tmp
    const videoRes = await fetch(video_url);
    if (!videoRes.ok) throw new Error(`Failed to fetch video: ${videoRes.status}`);
    writeFileSync(videoPath, Buffer.from(await videoRes.arrayBuffer()));

    // Write audio to tmp (base64 or download)
    if (audio_base64) {
      writeFileSync(audioPath, Buffer.from(audio_base64, "base64"));
    } else {
      const audioRes = await fetch(audio_url);
      if (!audioRes.ok) throw new Error(`Failed to fetch audio: ${audioRes.status}`);
      writeFileSync(audioPath, Buffer.from(await audioRes.arrayBuffer()));
    }

    // Merge with FFmpeg
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions([
          "-c:v", "copy",
          "-c:a", "aac",
          "-map", "0:v:0",
          "-map", "1:a:0",
          "-shortest",
        ])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(err))
        .run();
    });

    const buffer = readFileSync(outputPath);

    return new Response(buffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": 'attachment; filename="omnyra-final.mp4"',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[merge-video-audio] error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  } finally {
    for (const p of [videoPath, audioPath, outputPath]) {
      try { unlinkSync(p); } catch { /* already cleaned */ }
    }
  }
}
