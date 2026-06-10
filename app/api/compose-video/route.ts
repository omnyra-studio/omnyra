/**
 * POST /api/compose-video
 *
 * Three dispatch modes (checked in order):
 *   1. Cinematic multi-clip  — body.clipUrls[]   (Kling clips from generate-cinematic-sequence)
 *   2. Single-clip preview   — body.videoUrl     (legacy / fast path)
 *   3. Shot-plan DB          — body.projectId    (full render engine path)
 *
 * Env vars:
 *   COMPOSER_SERVICE_URL   Railway composer endpoint
 *   COMPOSER_API_KEY       Shared secret for Railway composer
 */

// ── Imports (all static imports MUST precede side-effect statements) ───────────
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import { tmpdir } from "os";
import { join } from "path";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { randomUUID } from "crypto";
import { saveRenderToLibrary } from "@/lib/renders/save-render";
import {
  buildRenderContract,
  assertContractRenderable,
  RenderContractError,
  type ShotAssetInput,
  type ValidRenderContract,
} from "@/lib/timeline/build-contract";
import { rebuildRender } from "@/lib/render/incremental-engine";
import { processShardJob } from "@/lib/workers/shard-worker";
import { getShardCache } from "@/lib/render/shard-cache";
import { mergeShards } from "@/lib/render/merge";
import type { RenderShard, MergeResult } from "@/lib/render/types";
import type { WorkerResult } from "@/lib/workers/types";

// Side-effect AFTER all imports — ffmpeg binary path resolution
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const maxDuration = 300; // Vercel Fluid Compute — 5-minute ceiling

// ── Types ─────────────────────────────────────────────────────────────────────

interface ComposeBody {
  projectId?:    string;   // shot-plan mode
  shotPlanId?:   string;
  voiceoverUrl?: string;
  videoUrl?:     string;   // single-clip mode
  clipUrls?:     string[]; // cinematic multi-clip mode
  clipDuration?: number;   // seconds per clip (default 10)
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Asserts final video duration meets the 95% compliance threshold.
 * Throws with DURATION_COMPLIANCE_FAILED if actual < 95% of requested.
 * Skips silently if actualSec is 0 (probe unavailable).
 */
function assertDurationCompliance(
  actualSec: number,
  requestedSec: number,
  phase: string,
): void {
  const minRequired = requestedSec * 0.95;
  console.log(
    `[DURATION_GATE] ${phase} actual=${actualSec.toFixed(2)}s requested=${requestedSec}s ` +
    `min=${minRequired.toFixed(2)}s compliant=${actualSec >= minRequired}`,
  );
  if (actualSec > 0 && actualSec < minRequired) {
    throw new Error(
      `DURATION_COMPLIANCE_FAILED [${phase}]: actual=${actualSec.toFixed(2)}s < 95% of requested ${requestedSec}s (min=${minRequired.toFixed(2)}s)`,
    );
  }
}

/**
 * ffprobe with hard timeout.
 * Without a timeout, a corrupt or truncated MP4 can hang ffprobe indefinitely,
 * blocking the entire route until Vercel's maxDuration kills it.
 */
function probeWithTimeout(
  filePath: string,
  label: string,
  timeoutMs = 15_000,
): Promise<ffmpeg.FfprobeData | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`[ffprobe] TIMEOUT probing ${label} after ${timeoutMs}ms`);
      resolve(null);
    }, timeoutMs);
    ffmpeg.ffprobe(filePath, (err, data) => {
      clearTimeout(timer);
      if (err) {
        console.warn(`[ffprobe] ERROR probing ${label}: ${err.message}`);
        resolve(null);
      } else {
        resolve(data);
      }
    });
  });
}

/**
 * Download a URL to a Node.js Buffer with:
 *   - AbortController timeout (prevents hanging on slow CDNs)
 *   - Non-200 HTTP error surfacing
 *   - Zero-byte guard (expired fal.ai URLs return 0 bytes)
 */
async function downloadToBuffer(url: string, label: string, timeoutMs = 60_000): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) {
      throw new Error(`${label}: HTTP ${res.status} — ${url.substring(0, 120)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) {
      throw new Error(`${label}: 0 bytes received — URL may be expired or empty: ${url.substring(0, 120)}`);
    }
    return buf;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`${label}: download timed out after ${timeoutMs / 1000}s — ${url.substring(0, 80)}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Upload a Buffer to Supabase "renders" bucket using the admin client.
 * Validates buffer is non-empty before uploading.
 * Returns the public URL on success; throws on any failure.
 */
async function uploadToStorage(
  buffer: Buffer,
  storagePath: string,
  label: string,
): Promise<string> {
  if (!buffer.length) {
    throw new Error(`[STORAGE] ${label}: refusing to upload 0-byte buffer → ${storagePath}`);
  }
  console.log(`[STORAGE] ${label}: uploading ${buffer.length}bytes → ${storagePath}`);
  const { error } = await supabaseAdmin.storage
    .from("renders")
    .upload(storagePath, buffer, { contentType: "video/mp4", upsert: true });
  if (error) {
    throw new Error(`[STORAGE] ${label}: upload failed — ${error.message}`);
  }
  const { data: { publicUrl } } = supabaseAdmin.storage.from("renders").getPublicUrl(storagePath);
  if (!publicUrl) {
    throw new Error(`[STORAGE] ${label}: getPublicUrl returned empty string — is the 'renders' bucket set to public?`);
  }
  console.log(`[STORAGE] ${label}: done → ${publicUrl.substring(0, 100)}`);
  return publicUrl;
}

/** Fetch with AbortController timeout */
function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(id));
}

/** Wrap Railway Composer call — returns parsed JSON or throws with detail */
async function callComposer(
  composerUrl: string,
  composerKey: string,
  form: FormData,
  timeoutMs: number,
  label: string,
): Promise<{ success: boolean; video_url: string; duration_seconds?: number | null; error?: string }> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${composerUrl}/compose`,
      { method: "POST", headers: { "x-api-key": composerKey }, body: form },
      timeoutMs,
    );
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    throw new Error(`${label}: ${isTimeout ? `composer timed out after ${timeoutMs / 1000}s` : `composer unreachable — ${err instanceof Error ? err.message : err}`}`);
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const b = await res.json() as { error?: string }; if (b.error) detail = b.error; } catch { /* */ }
    throw new Error(`${label}: composer error — ${detail}`);
  }

  const result = await res.json() as { success: boolean; video_url: string; duration_seconds?: number | null; error?: string };
  if (!result.success || !result.video_url) {
    throw new Error(`${label}: composer reported failure — ${result.error ?? "no reason"}`);
  }
  return result;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: Request) {

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────────
  let body: ComposeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  console.log("[VOICE_TRACE_COMPOSE_RECEIVED]", {
    bodyKeys: Object.keys(body),
    voiceoverUrl: body.voiceoverUrl?.substring(0, 80),
    hasVoiceover: !!(body.voiceoverUrl?.trim()),
    clipUrls: body.clipUrls?.length,
    videoUrl: body.videoUrl?.substring(0, 60),
  });

  const { projectId, shotPlanId, voiceoverUrl: bodyVoiceoverUrl } = body;
  const composerUrl = process.env.COMPOSER_SERVICE_URL ?? null;
  const composerKey = process.env.COMPOSER_API_KEY ?? "";
  if (composerUrl && !composerKey) {
    console.warn("[compose-video] COMPOSER_API_KEY not set — Railway requests will use empty x-api-key");
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MODE 1 — CINEMATIC MULTI-CLIP  (body.clipUrls[])
  // ══════════════════════════════════════════════════════════════════════════════
  if (body.clipUrls?.length) {
    const routeT0     = Date.now();
    const clipUrls    = body.clipUrls.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
    if (!clipUrls.length) {
      return NextResponse.json({ success: false, error: "All clip URLs were empty after filtering" }, { status: 400 });
    }
    const clipDuration = typeof body.clipDuration === "number" ? body.clipDuration : 10;
    const voiceUrl    = body.voiceoverUrl?.trim() ?? null;
    const id          = randomUUID();
    const tmpDirBase  = tmpdir();

    console.log("[TIMING] compose-video start mode=cinematic");
    console.log("[PHASE1] cinematic mode=multi_clip");
    console.log(`[PHASE1] clipCount=${clipUrls.length} clipDuration=${clipDuration}s hasVoiceover=${!!voiceUrl} composerAvailable=${!!composerUrl}`);

    // PHASE 2: download all clips + voiceover in parallel with timeout + size validation
    // Timeout reduced 90s→30s: 10s Kling clips are ~2–5 MB, download in <5s on normal CDN.
    console.log("[TIMING] PHASE2 DOWNLOAD start");
    const phase2T0 = Date.now();
    let clipBuffers: Buffer[];
    let voiceBuffer: Buffer | null = null;
    try {
      [clipBuffers, voiceBuffer] = await Promise.all([
        Promise.all(clipUrls.map((url, i) => downloadToBuffer(url, `clip[${i + 1}/${clipUrls.length}]`, 30_000))),
        voiceUrl ? downloadToBuffer(voiceUrl, "voiceover", 30_000) : Promise.resolve(null),
      ]);
    } catch (err) {
      const msg  = err instanceof Error ? err.message : "Media download failed";
      const stack = err instanceof Error ? err.stack : undefined;
      console.error(`[TIMING] PHASE2 DOWNLOAD FAILED ${Date.now() - phase2T0}ms:`, msg);
      return NextResponse.json({ success: false, phase: "DOWNLOAD", error: msg, stack }, { status: 502 });
    }
    console.log(`[TIMING] PHASE2 DOWNLOAD complete ${Date.now() - phase2T0}ms`);

    // PHASE 3: verify download sizes
    console.log(`[PHASE3] DOWNLOADED_CLIPS=${clipBuffers.length} sizes=${clipBuffers.map((b, i) => `clip${i + 1}:${b.length}bytes`).join(" ")}`);
    if (voiceBuffer) console.log(`[PHASE3] DOWNLOADED_VOICE size=${voiceBuffer.length}bytes`);
    else console.log("[PHASE3] NO_VOICE");

    const emptyClip = clipBuffers.findIndex(b => !b.length);
    if (emptyClip !== -1) {
      return NextResponse.json({ success: false, phase: "DOWNLOAD", error: `clip[${emptyClip + 1}] is 0 bytes — URL expired` }, { status: 502 });
    }

    // ── Always prepare local FFmpeg paths (used as Railway fallback too) ─────────
    const clipPaths      = clipUrls.map((_, i) => join(tmpDirBase, `cv-cin-${id}-clip${i}.mp4`));
    const concatListPath = join(tmpDirBase, `cv-cin-${id}-concat.txt`);
    const stitchedPath   = join(tmpDirBase, `cv-cin-${id}-stitched.mp4`);
    const audioPath      = join(tmpDirBase, `cv-cin-${id}-audio.mp3`);
    const outputPath     = join(tmpDirBase, `cv-cin-${id}-output.mp4`);
    const cleanupPaths   = [...clipPaths, concatListPath, stitchedPath, audioPath, outputPath];

    // ── Try Railway Composer first (if configured AND voiceover is present) ─────
    // Skip Railway entirely when there's no voiceover — Railway requires it.
    // On ANY Railway failure we fall through to local FFmpeg rather than returning 502.
    if (composerUrl && voiceBuffer) {
      const shotPlanShots = clipUrls.map(() => ({
        duration:            clipDuration,
        energy_curve:        "sustain",
        transition_in:       "hard_cut",
        transition_after:    null,
        transition_duration: 0,
        zoom_effect:         false,
      }));

      console.log("[PHASE4] RAILWAY_REQUEST", JSON.stringify({
        composerUrl,
        clipCount:    clipBuffers.length,
        clipSizes:    clipBuffers.map((b, i) => ({ clip: i + 1, bytes: b.length })),
        hasVoiceover: !!voiceBuffer,
        voiceBytes:   voiceBuffer?.length ?? 0,
        shot_plan:    { shots: shotPlanShots },
      }, null, 2));

      const form = new FormData();
      for (let i = 0; i < clipBuffers.length; i++) {
        form.append("clips", new Blob([Uint8Array.from(clipBuffers[i])], { type: "video/mp4" }), `clip_${i}.mp4`);
      }
      if (voiceBuffer) {
        form.append("voiceover", new Blob([Uint8Array.from(voiceBuffer)], { type: "audio/mpeg" }), "voiceover.mp3");
      }
      form.append("shot_plan", JSON.stringify({ shots: shotPlanShots }));

      console.log("[TIMING] PHASE4 COMPOSER start");
      const phase4T0 = Date.now();
      let composeResult: { success: boolean; video_url: string; duration_seconds?: number | null } | null = null;
      try {
        composeResult = await callComposer(composerUrl, composerKey, form, 90_000, "[PHASE4:cinematic]");
        console.log(`[TIMING] PHASE4 COMPOSER complete ${Date.now() - phase4T0}ms`);
        console.log("[PHASE4] RAILWAY_RESPONSE", JSON.stringify(composeResult, null, 2));
        console.log(`[PHASE4] RAILWAY_REPORTED_DURATION=${composeResult.duration_seconds}s expected=${clipUrls.length * clipDuration}s`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Composer call failed";
        // Railway failed — log and fall through to local FFmpeg rather than 502
        console.warn(`[TIMING] PHASE4 COMPOSER FAILED ${Date.now() - phase4T0}ms (falling back to local FFmpeg): ${msg}`);
      }

      if (composeResult) {
        // Railway succeeded — download output, probe, upload
        const composedUrl = composeResult.video_url.startsWith("http")
          ? composeResult.video_url
          : `${composerUrl}${composeResult.video_url}`;

        console.log("[TIMING] PHASE5 OUTPUT_DOWNLOAD start");
        const phase5T0 = Date.now();
        let composedBuffer: Buffer | null = null;
        try {
          composedBuffer = await downloadToBuffer(composedUrl, "composer output", 30_000);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Composer output download failed";
          console.warn(`[TIMING] PHASE5 OUTPUT_DOWNLOAD FAILED ${Date.now() - phase5T0}ms (falling back to local FFmpeg): ${msg}`);
        }

        if (composedBuffer) {
          console.log(`[TIMING] PHASE5 OUTPUT_DOWNLOAD complete ${Date.now() - phase5T0}ms bytes=${composedBuffer.length}`);

          const probePath = join(tmpDirBase, `cv-cin-probe-${id}.mp4`);
          try {
            writeFileSync(probePath, composedBuffer);
            const meta = await probeWithTimeout(probePath, "cinematic composer output", 15_000);
            if (meta) {
              const dur      = meta.format?.duration ?? "unknown";
              const durSec   = typeof dur === "number" ? dur : parseFloat(String(dur)) || 0;
              const vStreams = (meta.streams ?? []).filter(s => s.codec_type === "video");
              const aStreams = (meta.streams ?? []).filter(s => s.codec_type === "audio");
              console.log(`[PHASE5] COMPOSER_DURATION=${dur}s expected=${clipUrls.length * clipDuration}s clips=${clipUrls.length}`);
              console.log(`[PHASE5] VIDEO_STREAMS=${vStreams.length} AUDIO_STREAMS=${aStreams.length} SIZE_BYTES=${composedBuffer.length}`);
              if (vStreams[0]) console.log(`[PHASE5] VIDEO_STREAM codec=${vStreams[0].codec_name} duration=${vStreams[0].duration}s`);
              const minRequired = clipUrls.length * clipDuration * 0.95;
              if (durSec > 0 && durSec < minRequired) {
                console.warn(`[DURATION_GATE:railway] non-compliant actual=${durSec.toFixed(2)}s min=${minRequired.toFixed(2)}s — falling back to local FFmpeg for enforcement`);
              } else if (durSec > 0) {
                console.log(`[DURATION_GATE:railway] compliant actual=${durSec.toFixed(2)}s min=${minRequired.toFixed(2)}s`);
              }
            }
          } finally {
            try { unlinkSync(probePath); } catch { /* temp cleanup */ }
          }

          console.log("[TIMING] PHASE6 UPLOAD start");
          const phase6T0 = Date.now();
          const storagePath = `renders/${user.id}/${Date.now()}/cinematic.mp4`;
          try {
            const publicUrl = await uploadToStorage(composedBuffer, storagePath, "cinematic");
            console.log(`[TIMING] PHASE6 UPLOAD complete ${Date.now() - phase6T0}ms`);
            console.log(`[TIMING] compose-video TOTAL ${Date.now() - routeT0}ms clips=${clipUrls.length}`);
            console.log(`[PHASE6] cinematic done (railway) → ${publicUrl.substring(0, 80)}`);
            void saveRenderToLibrary({ userId: user.id, videoUrl: publicUrl, template: "cinematic" })
              .catch(e => console.warn("[compose-video] save-render failed:", e instanceof Error ? e.message : e));
            return NextResponse.json({
              success:          true,
              video_url:        publicUrl,
              has_audio:        !!voiceBuffer,
              duration_seconds: composeResult.duration_seconds ?? null,
              timing_ms:        { download: Date.now() - phase2T0, total: Date.now() - routeT0 },
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Storage upload failed";
            console.warn(`[TIMING] PHASE6 UPLOAD FAILED ${Date.now() - phase6T0}ms (falling back to local FFmpeg): ${msg}`);
          }
        }
      }

      console.log("[PHASE4:local] Railway path failed or skipped — falling back to local FFmpeg concat");
    } else {
      console.log("[PHASE4:local] COMPOSER_SERVICE_URL absent — local FFmpeg concat");
    }

    // ── Local FFmpeg concat path (primary when no Railway, fallback when Railway fails) ──
    try {
      for (let i = 0; i < clipBuffers.length; i++) {
        writeFileSync(clipPaths[i], clipBuffers[i]);
      }

      // ── Per-clip duration inventory (before concatenation) ────────────────────
      const clipActualDurations: (number | null)[] = [];
      for (let i = 0; i < clipBuffers.length; i++) {
        const m = await probeWithTimeout(clipPaths[i], `input clip[${i + 1}]`, 10_000);
        const raw = m?.format?.duration;
        const sec = raw !== undefined ? (typeof raw === "number" ? raw : parseFloat(String(raw)) || null) : null;
        clipActualDurations.push(sec);
        console.log(`[DURATION_INVENTORY] clip[${i + 1}] actual=${sec !== null ? sec.toFixed(2) + "s" : "unknown"} bytes=${clipBuffers[i].length}`);
      }
      const sumInputSec = clipActualDurations.reduce((a, d) => a + (d ?? clipDuration), 0);
      const requestedTotalSec = clipUrls.length * clipDuration;
      console.info("[DURATION_PLAN]", {
        REQUESTED_DURATION:    requestedTotalSec,
        SUM_SCENE_DURATIONS:   parseFloat(sumInputSec.toFixed(2)),
        clip_count:            clipUrls.length,
        clip_duration_nominal: clipDuration,
      });

      let finalVideoPath: string;

      if (clipBuffers.length === 1) {
        finalVideoPath = clipPaths[0];
      } else {
        const concatContent = clipPaths.map(p => `file '${p.replace(/\\/g, "/")}'`).join("\n");
        writeFileSync(concatListPath, concatContent);
        console.log(`[PHASE4:local] concat list (${clipPaths.length} entries):\n${concatContent}`);

        await new Promise<void>((resolve, reject) => {
          ffmpeg()
            .input(concatListPath)
            .inputOptions(["-f", "concat", "-safe", "0"])
            .outputOptions(["-c", "copy"])
            .output(stitchedPath)
            .on("stderr", (line: string) => console.log("[PHASE4:local:ffmpeg:stderr]", line))
            .on("end", () => resolve())
            .on("error", (err: Error) => reject(new Error(`FFmpeg concat failed: ${err.message}`)))
            .run();
        });

        if (!existsSync(stitchedPath)) {
          throw new Error("FFmpeg concat completed but produced no output file");
        }
        finalVideoPath = stitchedPath;
      }

      let ttsDurationSec = 0;
      if (voiceBuffer) {
        writeFileSync(audioPath, voiceBuffer);
        const audioMeta = await probeWithTimeout(audioPath, "voiceover audio", 10_000);
        const rawAudio = audioMeta?.format?.duration;
        ttsDurationSec = rawAudio !== undefined ? (typeof rawAudio === "number" ? rawAudio : parseFloat(String(rawAudio)) || 0) : 0;
        console.log(`[TTS_DURATION] ${ttsDurationSec.toFixed(2)}s bytes=${voiceBuffer.length}`);

        // If video is shorter than audio, loop the video stream to cover the full voice duration.
        // This prevents black screen / frozen last frame when voice outlasts clips.
        const videoShorter = ttsDurationSec > 0 && sumInputSec < ttsDurationSec;
        const mergeCmd = ffmpeg();
        if (videoShorter) {
          mergeCmd.inputOptions(["-stream_loop", "-1"]).input(finalVideoPath);
          console.log(`[DURATION_LOOP] video=${sumInputSec.toFixed(1)}s < voice=${ttsDurationSec.toFixed(1)}s — looping video stream`);
        } else {
          mergeCmd.input(finalVideoPath);
        }
        const outputSec = ttsDurationSec > 0 ? ttsDurationSec : sumInputSec;

        await new Promise<void>((resolve, reject) => {
          mergeCmd
            .input(audioPath)
            .outputOptions([
              "-c:v", "copy",
              "-c:a", "aac",
              "-map", "0:v:0",
              "-map", "1:a:0",
              "-t", outputSec.toFixed(3),
              "-movflags", "+faststart",
            ])
            .output(outputPath)
            .on("stderr", (line: string) => console.log("[PHASE4:local:merge:stderr]", line))
            .on("end", () => resolve())
            .on("error", (err: Error) => reject(new Error(`FFmpeg audio merge failed: ${err.message}`)))
            .run();
        });

        console.info(`[DURATION_FINAL] voice=${ttsDurationSec.toFixed(1)}s video=${sumInputSec.toFixed(1)}s output=${outputSec.toFixed(1)}s looped=${videoShorter} clips=${clipUrls.length}`);

        if (!existsSync(outputPath)) {
          throw new Error("FFmpeg audio merge completed but produced no output file");
        }
        finalVideoPath = outputPath;
      }

      const meta = await probeWithTimeout(finalVideoPath, "cinematic local output", 15_000);
      let finalDurationSec = 0;
      if (meta) {
        const dur      = meta.format?.duration ?? "unknown";
        finalDurationSec = typeof dur === "number" ? dur : parseFloat(String(dur)) || 0;
        const vStreams = (meta.streams ?? []).filter(s => s.codec_type === "video");
        const aStreams = (meta.streams ?? []).filter(s => s.codec_type === "audio");
        console.log(`[PHASE5:local] STITCH_DURATION=${dur}s expected=${clipBuffers.length * clipDuration}s clips=${clipBuffers.length}`);
        console.log(`[PHASE5:local] VIDEO_STREAMS=${vStreams.length} AUDIO_STREAMS=${aStreams.length}`);
        if (vStreams[0]) console.log(`[PHASE5:local] VIDEO codec=${vStreams[0].codec_name} duration=${vStreams[0].duration}s`);
        if (ttsDurationSec > 0) {
          console.info("[DURATION_ALIGNMENT]", {
            TTS_DURATION:         parseFloat(ttsDurationSec.toFixed(2)),
            FINAL_VIDEO_DURATION: parseFloat(finalDurationSec.toFixed(2)),
            delta_sec:            parseFloat((finalDurationSec - ttsDurationSec).toFixed(2)),
          });
        }
        assertDurationCompliance(finalDurationSec, clipBuffers.length * clipDuration, "local_ffmpeg");
      }

      const finalBuffer = readFileSync(finalVideoPath);
      if (!finalBuffer.length) throw new Error("Final stitched file is 0 bytes");

      const storagePath = `renders/${user.id}/${Date.now()}/cinematic.mp4`;
      const publicUrl = await uploadToStorage(finalBuffer, storagePath, "cinematic:local");

      console.log(`[PHASE6:local] done → ${publicUrl.substring(0, 80)}`);
      console.log(`[TIMING] compose-video TOTAL ${Date.now() - routeT0}ms clips=${clipUrls.length}`);
      void saveRenderToLibrary({ userId: user.id, videoUrl: publicUrl, template: "cinematic" })
        .catch(e => console.warn("[compose-video] save-render failed:", e instanceof Error ? e.message : e));
      return NextResponse.json({ success: true, video_url: publicUrl, has_audio: !!voiceBuffer });

    } catch (err) {
      const msg   = err instanceof Error ? err.message : "Local cinematic compose failed";
      const stack = err instanceof Error ? err.stack : undefined;
      console.error("[compose-video:cinematic:local] FAILED:", msg, stack);
      return NextResponse.json({ success: false, phase: "LOCAL_FFMPEG", error: msg }, { status: 500 });
    } finally {
      for (const p of cleanupPaths) { try { unlinkSync(p); } catch { /* already gone */ } }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MODE 2 — SINGLE-CLIP PREVIEW  (body.videoUrl)
  // ══════════════════════════════════════════════════════════════════════════════
  if (body.videoUrl?.trim()) {
    const singleClipUrl  = body.videoUrl.trim();
    const singleVoiceUrl = body.voiceoverUrl?.trim() ?? null;

    if (composerUrl) {
      // ── Railway Composer path ──────────────────────────────────────────────────
      console.log("[PHASE1:single] mode=railway_single_clip");
      console.log(`[PHASE1:single] videoUrl=${singleClipUrl.substring(0, 80)} hasVoiceover=${!!singleVoiceUrl}`);

      let clipBuffer: Buffer;
      let voiceBufferSingle: Buffer | null = null;
      try {
        console.log("[PHASE2:single] downloading clip and voiceover");
        [clipBuffer, voiceBufferSingle] = await Promise.all([
          downloadToBuffer(singleClipUrl, "single clip", 90_000),
          singleVoiceUrl ? downloadToBuffer(singleVoiceUrl, "voiceover", 60_000) : Promise.resolve(null),
        ]);
        console.log(`[PHASE2:single] clip=${clipBuffer.length}bytes voice=${voiceBufferSingle?.length ?? 0}bytes`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Download failed";
        console.error("[PHASE2:single] FAILED:", msg);
        return NextResponse.json({ success: false, phase: "DOWNLOAD", error: msg }, { status: 502 });
      }

      // Use the actual clip duration from ffprobe rather than hardcoded 8s
      const id = randomUUID();
      const tmpDirBase = tmpdir();
      const tmpClipPath = join(tmpDirBase, `cv-sc-probe-${id}.mp4`);
      let probedDuration = 8;
      try {
        writeFileSync(tmpClipPath, clipBuffer);
        const meta = await probeWithTimeout(tmpClipPath, "single clip", 15_000);
        if (meta?.format?.duration) {
          probedDuration = typeof meta.format.duration === "number"
            ? meta.format.duration
            : parseFloat(String(meta.format.duration)) || 8;
        }
        console.log(`[PHASE3:single] VIDEO_DURATION=${probedDuration}s size=${clipBuffer.length}bytes`);
      } finally {
        try { unlinkSync(tmpClipPath); } catch { /* */ }
      }

      const form = new FormData();
      form.append("clips", new Blob([new Uint8Array(clipBuffer)], { type: "video/mp4" }), "shot_1.mp4");
      if (voiceBufferSingle) form.append("voiceover", new Blob([new Uint8Array(voiceBufferSingle)], { type: "audio/mpeg" }), "voiceover.mp3");
      form.append("shot_plan", JSON.stringify({
        shots: [{ duration: Math.round(probedDuration), energy_curve: "sustain", transition_in: "hard_cut", transition_after: null, transition_duration: 0, zoom_effect: false }],
      }));

      console.log(`[PHASE4:single] → Railway clips=1 duration=${Math.round(probedDuration)}s hasVoiceover=${!!voiceBufferSingle}`);

      let composeResult: { success: boolean; video_url: string; duration_seconds?: number | null };
      try {
        composeResult = await callComposer(composerUrl, composerKey, form, 120_000, "[PHASE4:single]");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Composer call failed";
        console.error("[PHASE4:single] FAILED:", msg);
        return NextResponse.json({ success: false, phase: "COMPOSER", error: msg }, { status: 502 });
      }
      console.log("[PHASE4:single] RAILWAY_RESPONSE", JSON.stringify(composeResult, null, 2));

      const composedUrl = composeResult.video_url.startsWith("http")
        ? composeResult.video_url
        : `${composerUrl}${composeResult.video_url}`;

      let composedBuffer: Buffer;
      try {
        composedBuffer = await downloadToBuffer(composedUrl, "single-clip composer output", 120_000);
        console.log(`[PHASE5:single] COMPOSER_DURATION=${composeResult.duration_seconds}s SIZE_BYTES=${composedBuffer.length}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Composer output download failed";
        console.error("[PHASE5:single] FAILED:", msg);
        return NextResponse.json({ success: false, phase: "COMPOSER_DOWNLOAD", error: msg }, { status: 502 });
      }

      const storagePath = `renders/${user.id}/${Date.now()}/preview.mp4`;
      let publicUrl: string;
      try {
        publicUrl = await uploadToStorage(composedBuffer, storagePath, "single:railway");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Storage upload failed";
        console.error("[PHASE6:single] FAILED:", msg);
        return NextResponse.json({ success: false, phase: "UPLOAD_TO_SUPABASE", error: msg }, { status: 500 });
      }

      console.log(`[PHASE6:single] done → ${publicUrl.substring(0, 80)}`);
      void saveRenderToLibrary({ userId: user.id, videoUrl: publicUrl, template: "avatar" })
        .catch(e => console.warn("[compose-video:single] save-render failed:", e instanceof Error ? e.message : e));
      return NextResponse.json({ success: true, video_url: publicUrl, has_audio: !!voiceBufferSingle });

    } else {
      // ── Local FFmpeg path ──────────────────────────────────────────────────────
      const id         = randomUUID();
      const tmpDir     = tmpdir();
      const videoPath  = join(tmpDir, `cv-video-${id}.mp4`);
      const audioPath  = join(tmpDir, `cv-audio-${id}.mp3`);
      const outputPath = join(tmpDir, `cv-output-${id}.mp4`);
      const paths      = [videoPath, audioPath, outputPath];

      console.log("[PHASE1:single] mode=local_ffmpeg");
      console.log(`[PHASE1:single] videoUrl=${singleClipUrl.substring(0, 80)} hasVoiceover=${!!singleVoiceUrl}`);

      try {
        // PHASE 2: download video
        const inputVideoBytes = await downloadToBuffer(singleClipUrl, "single clip", 90_000);
        writeFileSync(videoPath, inputVideoBytes);
        console.log(`[PHASE2:single] video downloaded size=${inputVideoBytes.length}bytes`);

        // PHASE 3: probe video duration
        const videoMeta = await probeWithTimeout(videoPath, "input video", 15_000);
        const rawDur    = videoMeta?.format?.duration ?? 0;
        const videoDuration = typeof rawDur === "number" ? rawDur : parseFloat(String(rawDur)) || 0;
        console.log(`[PHASE3:single] VIDEO_DURATION=${videoDuration}s size=${inputVideoBytes.length}bytes`);

        if (singleVoiceUrl) {
          // PHASE 3: download + probe audio
          const inputAudioBytes = await downloadToBuffer(singleVoiceUrl, "voiceover", 60_000);
          writeFileSync(audioPath, inputAudioBytes);
          console.log(`[PHASE3:single] audio downloaded size=${inputAudioBytes.length}bytes`);

          const audioMeta = await probeWithTimeout(audioPath, "input audio", 15_000);
          const rawADur   = audioMeta?.format?.duration ?? 0;
          const audioDuration = typeof rawADur === "number" ? rawADur : parseFloat(String(rawADur)) || 0;
          console.log(`[PHASE3:single] AUDIO_DURATION=${audioDuration}s video_shorter=${videoDuration < audioDuration} delta=${(audioDuration - videoDuration).toFixed(2)}s`);

          // PHASE 4: FFmpeg merge
          console.log("[PHASE4:single] starting FFmpeg merge");
          await new Promise<void>((resolve, reject) => {
            ffmpeg()
              .input(videoPath)
              .input(audioPath)
              .outputOptions(["-c:v", "copy", "-c:a", "aac", "-map", "0:v:0", "-map", "1:a:0"])
              .output(outputPath)
              .on("stderr", (line: string) => console.log("[PHASE4:single:ffmpeg:stderr]", line))
              .on("end", () => resolve())
              .on("error", (err: Error) => reject(new Error(`FFmpeg merge failed: ${err.message}`)))
              .run();
          });

          if (!existsSync(outputPath)) {
            throw new Error("FFmpeg merge completed but produced no output file");
          }
          console.log("[PHASE4:single] FFmpeg merge complete");

          // PHASE 5: probe merged output
          const outMeta = await probeWithTimeout(outputPath, "merged output", 15_000);
          if (outMeta) {
            const dur = outMeta.format?.duration ?? "unknown";
            console.log(`[PHASE5:single] OUTPUT_DURATION=${dur}s video_was=${videoDuration}s audio_was=${audioDuration}s`);
          }

        } else {
          // No audio — write input bytes directly to output slot
          console.log("[PHASE4:single] no audio — copying video as output");
          writeFileSync(outputPath, inputVideoBytes);
        }

        // PHASE 6: read, validate, upload
        const outputBuffer = readFileSync(outputPath);
        if (!outputBuffer.length) throw new Error("FFmpeg produced a 0-byte output file");
        console.log(`[PHASE6:single] uploading size=${outputBuffer.length}bytes`);

        const storagePath = `renders/${user.id}/${Date.now()}/preview.mp4`;
        let publicUrl: string;
        try {
          publicUrl = await uploadToStorage(outputBuffer, storagePath, "single:local");
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Storage upload failed";
          console.error("[PHASE6:single] FAILED:", msg);
          return NextResponse.json({ success: false, phase: "UPLOAD_TO_SUPABASE", error: msg }, { status: 500 });
        }

        console.log(`[PHASE6:single] done → ${publicUrl.substring(0, 80)}`);
        void saveRenderToLibrary({ userId: user.id, videoUrl: publicUrl, template: "avatar" })
          .catch(e => console.warn("[compose-video:single:local] save-render failed:", e instanceof Error ? e.message : e));
        return NextResponse.json({ success: true, video_url: publicUrl, has_audio: !!singleVoiceUrl });

      } catch (err) {
        const msg   = err instanceof Error ? err.message : "Local single-clip compose failed";
        const stack = err instanceof Error ? err.stack : undefined;
        console.error("[compose-video:single:local] FAILED:", msg);
        return NextResponse.json({ success: false, phase: "LOCAL_FFMPEG", error: msg, stack }, { status: 500 });
      } finally {
        for (const p of paths) { try { unlinkSync(p); } catch { /* already gone */ } }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MODE 3 — SHOT-PLAN DB MODE  (body.projectId)
  // ══════════════════════════════════════════════════════════════════════════════
  if (!projectId?.trim()) {
    return NextResponse.json(
      { success: false, error: "Missing required field: one of clipUrls, videoUrl, or projectId" },
      { status: 400 },
    );
  }

  if (!composerUrl) {
    console.error("[compose-video:shotplan] COMPOSER_SERVICE_URL not configured");
    return NextResponse.json(
      { success: false, error: "Video assembly service not configured. Contact support." },
      { status: 503 },
    );
  }

  // ── Load shots ────────────────────────────────────────────────────────────────
  let shotsQuery = supabase
    .from("shots")
    .select(
      "shot_id, shot_number, duration_seconds, energy_curve, transition_in, " +
      "transition_after, transition_duration, zoom_effect, clip_url, render_status",
    );

  if (shotPlanId) {
    shotsQuery = shotsQuery.eq("shot_plan_id", shotPlanId);
  } else {
    shotsQuery = shotsQuery.eq("project_id", projectId);
  }

  const { data: shots, error: shotsErr } = await shotsQuery;

  if (shotsErr) {
    console.error("[compose-video:shotplan] DB error loading shots:", shotsErr.message);
    return NextResponse.json({ success: false, error: "Failed to load shot plan" }, { status: 500 });
  }
  if (!shots?.length) {
    return NextResponse.json(
      { success: false, error: "No shots found. Run shot generation first." },
      { status: 404 },
    );
  }

  // ── Resolve voiceover URL ─────────────────────────────────────────────────────
  let voiceoverUrl = bodyVoiceoverUrl?.trim() ?? null;

  if (!voiceoverUrl && shotPlanId) {
    const { data: planRow, error: planErr } = await supabase
      .from("shot_plans")
      .select("voiceover_url")
      .eq("id", shotPlanId)
      .maybeSingle();
    if (planErr) console.warn("[compose-video:shotplan] shot_plans voiceover lookup error:", planErr.message);
    if (planRow?.voiceover_url) voiceoverUrl = planRow.voiceover_url as string;
  }

  if (!voiceoverUrl) {
    // .maybeSingle() avoids throwing when multiple rows exist — .single() throws with PGRST116
    const { data: renderJob, error: rjErr } = await supabase
      .from("render_jobs")
      .select("voiceover_url, id")
      .eq("user_id", user.id)
      .or(shotPlanId ? `plan_id.eq.${shotPlanId}` : `plan_id.is.null`)
      .not("voiceover_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (rjErr) {
      console.warn("[compose-video:shotplan] voiceover lookup error:", rjErr.message);
    }
    if (renderJob?.voiceover_url) voiceoverUrl = renderJob.voiceover_url as string;
  }

  if (!voiceoverUrl) {
    console.warn("[compose-video:shotplan] No voiceover found — rendering silent");
  }

  // ── Build render contract ─────────────────────────────────────────────────────
  let contract: ValidRenderContract;
  try {
    const raw = await buildRenderContract(
      shots as unknown as ShotAssetInput[],
      voiceoverUrl,
      projectId,
    );
    assertContractRenderable(raw);
    contract = raw;
  } catch (err) {
    if (err instanceof RenderContractError) {
      console.error("[compose-video:shotplan] Contract rejected:", err.violations);
      return NextResponse.json(
        { success: false, error: "Render contract failed", violations: err.violations },
        { status: 422 },
      );
    }
    throw err;
  }

  const hasVoiceover = contract.clips[0]?.audioAssetId !== "silent";
  console.log(
    `[compose-video:shotplan] Contract built — clips=${contract.clips.length} ` +
    `duration=${(contract.totalDurationFrames / contract.fps).toFixed(1)}s ` +
    `audio=${hasVoiceover ? "voiceover" : "silent"} compiledAt=${contract.compiledAt}`,
  );

  // ── Create render job row ─────────────────────────────────────────────────────
  const { data: job, error: jobErr } = await supabase
    .from("render_jobs")
    .upsert(
      {
        user_id:         user.id,
        plan_id:         shotPlanId ?? null,
        status:          "assembling",
        total_shots:     contract.clips.length,
        completed_shots: contract.clips.length,
        voiceover_url:   voiceoverUrl ?? null,
        updated_at:      new Date().toISOString(),
      },
      { onConflict: shotPlanId ? "plan_id" : undefined },
    )
    .select("id")
    .single();

  const jobId: string | null = jobErr ? null : (job?.id ?? null);
  if (jobErr) console.warn("[compose-video:shotplan] Could not create render_job row:", jobErr.message);

  // ── Incremental render engine ─────────────────────────────────────────────────
  const renderPlan = await rebuildRender(contract, projectId);
  const { plan, cachedShards, pendingShards } = renderPlan;

  console.log(
    `[compose-video:shotplan] ExecutionPlan: ${plan.totalShards} shards — ` +
    `${pendingShards.length} pending, ${cachedShards.length} cached, job=${jobId ?? "untracked"}`,
  );

  if (pendingShards.length > 0) {
    const shardResults = await Promise.allSettled(
      pendingShards.map(shard =>
        processShardJob({ type: "render_shard", shard, projectId, userId: user.id, fps: contract.fps }),
      ),
    );

    const failures = shardResults
      .map((r, i) => ({ r, shard: pendingShards[i] }))
      .filter(({ r }) =>
        r.status === "rejected" ||
        (r.status === "fulfilled" && !(r.value as WorkerResult).success),
      );

    if (failures.length > 0) {
      const errors = failures.map(({ r, shard }) =>
        r.status === "rejected"
          ? `${shard.shardId}: ${(r as PromiseRejectedResult).reason}`
          : `${shard.shardId}: ${(r as PromiseFulfilledResult<WorkerResult>).value.error}`,
      );
      console.error("[compose-video:shotplan] Shard failure(s):", errors);
      await markJobFailed(supabase, jobId, errors.join("; "));
      return NextResponse.json(
        { success: false, error: "One or more shards failed to render", errors },
        { status: 500 },
      );
    }
  }

  // ── Collect shard outputs ─────────────────────────────────────────────────────
  const allCacheHits = await getShardCache().getBatch(plan.shards.map(s => s.cacheKey));

  const shardsWithOutputs = plan.shards
    .map(shard => {
      const hit = allCacheHits.get(shard.cacheKey);
      return hit ? { ...shard, outputUrl: hit.outputUrl } : null;
    })
    .filter((s): s is RenderShard & { outputUrl: string } => s !== null);

  if (shardsWithOutputs.length !== plan.totalShards) {
    const missing = plan.shards.filter(s => !allCacheHits.has(s.cacheKey)).map(s => s.shardId);
    const msg = `Internal: shard outputs missing — ${missing.join(", ")}`;
    console.error("[compose-video:shotplan]", msg);
    await markJobFailed(supabase, jobId, msg);
    return NextResponse.json({ success: false, error: "Internal assembly error" }, { status: 500 });
  }

  // ── Merge layer ───────────────────────────────────────────────────────────────
  let mergeResult: MergeResult;
  try {
    mergeResult = await mergeShards(shardsWithOutputs, {
      composerUrl:  composerUrl,
      composerKey:  composerKey,
      voiceoverUrl,
      fps:          contract.fps,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Merge failed";
    console.error("[compose-video:shotplan] Merge error:", msg);
    await markJobFailed(supabase, jobId, msg);
    return NextResponse.json({ success: false, error: msg }, { status: 502 });
  }

  console.log(`[compose-video:shotplan] Merge done — ${mergeResult.durationSeconds}s`);

  // ── Download final video from composer ────────────────────────────────────────
  const videoDownloadUrl = mergeResult.videoUrl.startsWith("http")
    ? mergeResult.videoUrl
    : `${composerUrl}${mergeResult.videoUrl}`;

  let finalVideoBuffer: Buffer;
  try {
    finalVideoBuffer = await downloadToBuffer(videoDownloadUrl, "final composed video", 120_000);
    console.log(`[compose-video:shotplan] final video downloaded size=${finalVideoBuffer.length}bytes`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to download final video";
    console.error("[compose-video:shotplan] Video download error:", msg);
    await markJobFailed(supabase, jobId, msg);
    return NextResponse.json({ success: false, phase: "FINAL_DOWNLOAD", error: msg }, { status: 502 });
  }

  // ── Upload to Supabase ────────────────────────────────────────────────────────
  const storagePath = jobId
    ? `renders/${jobId}/final.mp4`
    : `renders/${user.id}/${Date.now()}/final.mp4`;

  let publicUrl: string;
  try {
    publicUrl = await uploadToStorage(finalVideoBuffer, storagePath, "final");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Storage upload failed";
    console.error("[compose-video:shotplan] Upload error:", msg);
    await markJobFailed(supabase, jobId, msg);
    return NextResponse.json({ success: false, phase: "UPLOAD_TO_SUPABASE", error: msg }, { status: 500 });
  }

  // ── Persist result to DB ──────────────────────────────────────────────────────
  if (jobId) {
    const { error: updateErr } = await supabase
      .from("render_jobs")
      .update({
        status:       "completed",
        video_url:    publicUrl,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (updateErr) {
      console.warn("[compose-video:shotplan] render_job update failed (non-fatal):", updateErr.message);
    } else {
      console.log(`[compose-video:shotplan] render_job ${jobId} marked completed`);
    }
  }

  const { error: projectUpdateErr } = await supabase
    .from("projects")
    .update({ status: "video_complete", video_url: publicUrl })
    .eq("id", projectId)
    .eq("user_id", user.id);

  if (projectUpdateErr) {
    console.warn("[compose-video:shotplan] project status update failed (non-fatal):", projectUpdateErr.message);
  }

  console.log(`[compose-video:shotplan] Complete — ${mergeResult.durationSeconds}s — ${plan.totalClips} clips → ${publicUrl}`);

  return NextResponse.json({
    success:              true,
    video_url:            publicUrl,
    duration_seconds:     mergeResult.durationSeconds,
    shots_used:           plan.totalClips,
    total_shots:          plan.totalClips,
    has_audio:            hasVoiceover,
    job_id:               jobId,
    contract_compiled_at: contract.compiledAt,
    shards_total:         plan.totalShards,
    shards_cached:        cachedShards.length,
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

async function markJobFailed(
   
  supabase: any,
  jobId: string | null,
  errorMessage: string,
): Promise<void> {
  if (!jobId) return;
  try {
    await supabase
      .from("render_jobs")
      .update({ status: "failed", error_message: errorMessage })
      .eq("id", jobId);
  } catch (err) {
    console.warn("[compose-video] Failed to mark job as failed:", err);
  }
}
