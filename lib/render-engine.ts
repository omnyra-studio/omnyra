/* Server-only render engine.
 *
 *   Status machine (canonical, 4-stage spec):
 *     queued → drafting → rendering → complete
 *                                   ↘ failed
 *
 * `runPipeline()` drives a row from `rendering` through to `complete`.
 * Internal sub-stages (voice / motion / voiceover) do NOT mutate the
 * status column — they emit granular rows into `render_events` only,
 * which the client subscribes to for fine-grained UI.
 *
 * IDEMPOTENCY:
 *   The pipeline is safe to re-invoke for the same render_id. Each stage
 *   short-circuits if its output already exists on the row:
 *     - audio_url present → skip voice
 *     - all scene URLs present in event payload → skip motion
 *     - video_url present → skip voiceover + finalisation
 *   This makes retries on failure or crashes safe — the system resumes
 *   from the last successful stage.
 *
 * CREDITS:
 *   Deduction is a SINGLE INSERT into `credit_transactions`. The DB
 *   trigger (see migrations/credit_ledger.sql) updates the cached
 *   `credits.balance` atomically. Never write to `credits.balance`
 *   directly from this module.
 *
 * Never import from the browser.
 */

import { createHmac, randomUUID } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, rmdirSync } from "fs";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import { supabaseAdmin } from "./supabase/admin";
import { trackEvent } from "./events/trackEvent";
import { openJob, completeJob, skipJob, failJob } from "./pipeline/jobs";
import type { Scene } from "./script-engine";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export type RenderStatus =
  | "queued"
  | "drafting"
  | "rendering"
  | "complete"
  | "failed";

export interface RunPipelineInput {
  renderId: string;
  userId: string;
  script: string;
  scenes: Scene[];
  voiceId: string;
  creditsRequired: number;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function updateRender(
  renderId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await supabaseAdmin
    .from("renders")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", renderId);
}

export type RenderEventType =
  | "render_created"
  | "brief_validated"
  | "script_generated"
  | "voice_started"
  | "voice_completed"
  | "motion_started"
  | "motion_completed"
  | "lipsync_started"      // kept: client event contract; semantically "voiceover_started"
  | "lipsync_completed"    // kept: client event contract; semantically "voiceover_completed"
  | "render_finalised"
  | "render_failed";

export async function emitEvent(
  renderId: string,
  event_type: RenderEventType,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await supabaseAdmin.from("render_events").insert({
    render_id: renderId,
    event_type,
    payload,
  });
}

/* ────────────────────────────────────────────────────────────────
 *  Storage
 * ─────────────────────────────────────────────────────────────── */

async function uploadBuffer(
  buffer: Buffer,
  storagePath: string,
  contentType: string,
): Promise<string> {
  const { error } = await supabaseAdmin.storage
    .from("renders")
    .upload(storagePath, buffer, { contentType, upsert: true });
  if (error) throw new Error(`storage_upload: ${error.message}`);
  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from("renders").getPublicUrl(storagePath);
  return publicUrl;
}

/* ────────────────────────────────────────────────────────────────
 *  Voice — ElevenLabs
 * ─────────────────────────────────────────────────────────────── */

async function generateVoice(script: string, voiceId: string): Promise<Buffer> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: script,
        model_id: "eleven_turbo_v2",
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.8,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`elevenlabs ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

/* ────────────────────────────────────────────────────────────────
 *  Motion — Kling / Runway / Pika
 * ─────────────────────────────────────────────────────────────── */

function klingJWT() {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ iss: process.env.KLING_ACCESS_KEY, exp: now + 1800, nbf: now - 5 }),
  ).toString("base64url");
  const sig = createHmac("sha256", process.env.KLING_SECRET_KEY ?? "")
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}

async function generateKlingVideo(prompt: string, durationSecs: number): Promise<string> {
  const submitRes = await fetch("https://api.klingai.com/v1/videos/text2video", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${klingJWT()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_name: "kling-v1",
      prompt,
      aspect_ratio: "9:16",
      duration: durationSecs,
      mode: "std",
    }),
  });
  if (!submitRes.ok) throw new Error(`kling submit ${submitRes.status}`);
  const submitData = await submitRes.json();
  const taskId = submitData.data?.task_id;
  if (!taskId) throw new Error("kling: no task_id");

  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    const pollRes = await fetch(
      `https://api.klingai.com/v1/videos/text2video/${taskId}`,
      { headers: { Authorization: `Bearer ${klingJWT()}` } },
    );
    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();
    const status = pollData.data?.task_status;
    if (status === "succeed") {
      const url = pollData.data?.task_result?.videos?.[0]?.url;
      if (!url) throw new Error("kling: no output url");
      return url;
    }
    if (status === "failed") throw new Error("kling: failed");
  }
  throw new Error("kling: timed out");
}

async function generateRunwayVideo(prompt: string, durationSecs: number): Promise<string> {
  const submitRes = await fetch("https://api.runwayml.com/v1/text_to_video", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, duration: durationSecs, ratio: "9:16" }),
  });
  if (!submitRes.ok) throw new Error(`runway submit ${submitRes.status}`);
  const submitData = await submitRes.json();
  const taskId = submitData.id;
  if (!taskId) throw new Error("runway: no task id");

  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    const pollRes = await fetch(
      `https://api.runwayml.com/v1/tasks/${taskId}`,
      { headers: { Authorization: `Bearer ${process.env.RUNWAY_API_KEY}` } },
    );
    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();
    if (pollData.status === "SUCCEEDED") {
      const url = pollData.output?.[0];
      if (!url) throw new Error("runway: no output url");
      return url;
    }
    if (pollData.status === "FAILED") throw new Error("runway: failed");
  }
  throw new Error("runway: timed out");
}

async function generatePikaVideo(prompt: string, _durationSecs: number): Promise<string> {
  const res = await fetch("https://api.pika.art/v1/generate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PIKA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, aspect_ratio: "9:16" }),
  });
  if (!res.ok) throw new Error(`pika ${res.status}`);
  const data = await res.json();
  const url = data.url ?? data.video_url;
  if (!url) throw new Error("pika: no output url");
  return url;
}

async function generateSceneVideo(scene: Scene): Promise<string> {
  const durationSecs = parseInt(scene.duration) || 5;
  if (scene.api === "kling") return generateKlingVideo(scene.visual_prompt, durationSecs);
  if (scene.api === "runway") return generateRunwayVideo(scene.visual_prompt, durationSecs);
  return generatePikaVideo(scene.visual_prompt, durationSecs);
}

/* ────────────────────────────────────────────────────────────────
 *  Voiceover attachment — ffmpeg
 *
 *  Replaces the legacy third-party lipsync step.
 *
 *  DMCE output is B-roll / cinematic footage — AI-generated scenes
 *  have no visible face. Lip-syncing is semantically meaningless here.
 *  The correct operation is: stitch all N scene clips into one
 *  continuous video, then mux the ElevenLabs narration onto it.
 *
 *  Steps:
 *    1. Download all scene videos to temp files.
 *    2. If N > 1: concat with `ffmpeg -f concat -c copy`.
 *    3. Download the voiceover audio to a temp file.
 *    4. Mux video + audio: `-c:v copy -c:a aac -shortest`.
 *    5. Upload to Supabase renders bucket, return public URL.
 *    6. Clean up all temp files in finally.
 * ─────────────────────────────────────────────────────────────── */

async function attachVoiceover(
  sceneUrls: string[],
  audioUrl: string,
  renderId: string,
  userId: string,
): Promise<string> {
  if (sceneUrls.length === 0) throw new Error("attachVoiceover: no scene URLs");

  const runId  = randomUUID().slice(0, 8);
  const tmpDir = join(tmpdir(), `omnyra_re_${runId}`);
  mkdirSync(tmpDir, { recursive: true });

  const toDelete: string[] = [];

  try {
    // ── 1. Download scene videos ──────────────────────────────────
    const scenePaths: string[] = [];
    for (let i = 0; i < sceneUrls.length; i++) {
      const p = join(tmpDir, `scene_${i}.mp4`);
      const buf = Buffer.from(await (await fetch(sceneUrls[i])).arrayBuffer());
      writeFileSync(p, buf);
      scenePaths.push(p);
      toDelete.push(p);
    }

    // ── 2. Stitch scenes (skip if single) ─────────────────────────
    let videoPath: string;
    if (scenePaths.length === 1) {
      videoPath = scenePaths[0];
    } else {
      const concatListPath = join(tmpDir, "concat.txt");
      const stitchedPath   = join(tmpDir, "stitched.mp4");
      toDelete.push(concatListPath, stitchedPath);

      writeFileSync(concatListPath, scenePaths.map(p => `file '${p}'`).join("\n"));

      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(concatListPath)
          .inputOptions(["-f", "concat", "-safe", "0"])
          .outputOptions(["-c", "copy"])
          .output(stitchedPath)
          .on("end", () => resolve())
          .on("error", (err: Error) => reject(new Error(`ffmpeg concat: ${err.message}`)))
          .run();
      });

      videoPath = stitchedPath;
    }

    // ── 3. Download audio ─────────────────────────────────────────
    const audioPath = join(tmpDir, "voice.mp3");
    const audioBuf  = Buffer.from(await (await fetch(audioUrl)).arrayBuffer());
    writeFileSync(audioPath, audioBuf);
    toDelete.push(audioPath);

    // ── 4. Mux video + audio ──────────────────────────────────────
    const outputPath = join(tmpDir, "output.mp4");
    toDelete.push(outputPath);

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions([
          "-c:v", "copy",
          "-c:a", "aac",
          "-map", "0:v:0",
          "-map", "1:a:0",
          "-shortest",       // trim to shorter of video/audio — narration is the reference
        ])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(new Error(`ffmpeg mux: ${err.message}`)))
        .run();
    });

    // ── 5. Upload ─────────────────────────────────────────────────
    const outputBuf = readFileSync(outputPath);
    const finalUrl  = await uploadBuffer(
      outputBuf,
      `${userId}/${renderId}-final.mp4`,
      "video/mp4",
    );

    console.log(`[render-engine] attachVoiceover done scenes=${sceneUrls.length} renderId=${renderId}`);
    return finalUrl;

  } finally {
    for (const p of toDelete) {
      try { unlinkSync(p); } catch { /* ignore */ }
    }
    try { rmdirSync(tmpDir); } catch { /* ignore */ }
  }
}

/* ────────────────────────────────────────────────────────────────
 *  Public — runPipeline
 *
 *  Idempotent. Status stays at "rendering" through all sub-stages;
 *  granular events go to render_events; user-level milestones (start,
 *  complete, failed) also go to the global `events` stream.
 *  Credits are deducted via a single ledger insert ONLY on success.
 * ─────────────────────────────────────────────────────────────── */

interface ExistingRender {
  audio_url: string | null;
  video_url: string | null;
  scene_urls: string[] | null;
}

async function getExisting(renderId: string): Promise<ExistingRender> {
  const { data } = await supabaseAdmin
    .from("renders")
    .select("audio_url, video_url, scene_urls")
    .eq("id", renderId)
    .single();
  return {
    audio_url: data?.audio_url ?? null,
    video_url: data?.video_url ?? null,
    scene_urls: (data as { scene_urls?: string[] | null } | null)?.scene_urls ?? null,
  };
}

export async function runPipeline(input: RunPipelineInput): Promise<void> {
  const { renderId, userId, script, scenes, voiceId, creditsRequired } = input;

  try {
    const existing = await getExisting(renderId);

    await trackEvent(userId, "render_started", { render_id: renderId });

    // ── Voice ─────────────────────────────────────────────────────
    let audioUrl: string;
    const voiceJob = await openJob({
      render_id: renderId, user_id: userId, step: "generate_voice", provider: "elevenlabs",
    });
    if (existing.audio_url) {
      audioUrl = existing.audio_url;
      await emitEvent(renderId, "voice_completed", {
        audio_url: audioUrl,
        cached: true,
      });
      if (voiceJob.id) await skipJob(voiceJob.id, "audio_url_already_present");
    } else {
      try {
        await emitEvent(renderId, "voice_started", { provider: "elevenlabs" });
        const audioBuffer = await generateVoice(script, voiceId);
        audioUrl = await uploadBuffer(
          audioBuffer,
          `${userId}/${renderId}-voice.mp3`,
          "audio/mpeg",
        );
        await updateRender(renderId, { audio_url: audioUrl });
        await emitEvent(renderId, "voice_completed", { audio_url: audioUrl });
        if (voiceJob.id) await completeJob(voiceJob.id, { audio_url: audioUrl });
      } catch (err) {
        if (voiceJob.id) await failJob(voiceJob.id, err instanceof Error ? err.message : String(err));
        throw err;
      }
    }

    // ── Motion ────────────────────────────────────────────────────
    let sceneUrls: string[];
    const motionJob = await openJob({
      render_id: renderId, user_id: userId, step: "generate_video",
      provider: Array.from(new Set(scenes.map((s) => s.api))).join(","),
    });
    if (
      Array.isArray(existing.scene_urls) &&
      existing.scene_urls.length === scenes.length
    ) {
      sceneUrls = existing.scene_urls;
      await emitEvent(renderId, "motion_completed", {
        scene_urls: sceneUrls,
        cached: true,
      });
      if (motionJob.id) await skipJob(motionJob.id, "scene_urls_already_present");
    } else {
      try {
        await emitEvent(renderId, "motion_started", {
          scene_count: scenes.length,
          providers: Array.from(new Set(scenes.map((s) => s.api))),
        });
        sceneUrls = await Promise.all(scenes.map(generateSceneVideo));
        await updateRender(renderId, { scene_urls: sceneUrls });
        await emitEvent(renderId, "motion_completed", { scene_urls: sceneUrls });
        if (motionJob.id) await completeJob(motionJob.id, { scene_urls: sceneUrls });
      } catch (err) {
        if (motionJob.id) await failJob(motionJob.id, err instanceof Error ? err.message : String(err));
        throw err;
      }
    }

    // ── Voiceover attachment ──────────────────────────────────────
    // Event types kept as lipsync_* to preserve the client event contract.
    // Implementation: stitch all scene clips, mux ElevenLabs narration.
    let finalUrl: string;
    const voiceoverJob = await openJob({
      render_id: renderId, user_id: userId, step: "attach_voiceover", provider: "ffmpeg",
    });
    if (existing.video_url) {
      finalUrl = existing.video_url;
      await emitEvent(renderId, "lipsync_completed", {
        video_url: finalUrl,
        cached: true,
      });
      if (voiceoverJob.id) await skipJob(voiceoverJob.id, "video_url_already_present");
    } else {
      try {
        await emitEvent(renderId, "lipsync_started", { provider: "ffmpeg", scene_count: sceneUrls.length });
        finalUrl = await attachVoiceover(sceneUrls, audioUrl, renderId, userId);
        await emitEvent(renderId, "lipsync_completed", { video_url: finalUrl });
        if (voiceoverJob.id) await completeJob(voiceoverJob.id, { video_url: finalUrl });
      } catch (err) {
        if (voiceoverJob.id) await failJob(voiceoverJob.id, err instanceof Error ? err.message : String(err));
        throw err;
      }
    }

    // ── Finalise + deduct credits (ledger) ────────────────────────
    const { data: priorRow } = await supabaseAdmin
      .from("renders")
      .select("credits_used")
      .eq("id", renderId)
      .single();

    if (!priorRow?.credits_used) {
      await supabaseAdmin.from("credit_transactions").insert({
        user_id: userId,
        amount: -creditsRequired,
        type: "usage",
        description: `pipeline_render:${renderId}`,
      });
    }

    await updateRender(renderId, {
      status: "complete" satisfies RenderStatus,
      video_url: finalUrl,
      credits_used: creditsRequired,
      completed_at: new Date().toISOString(),
      error_message: null,
    });

    await emitEvent(renderId, "render_finalised", {
      video_url: finalUrl,
      credits_used: creditsRequired,
    });
    await trackEvent(userId, "render_completed", {
      render_id: renderId,
      video_url: finalUrl,
      credits_used: creditsRequired,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[render-engine] render ${renderId} failed:`, msg);
    await updateRender(renderId, {
      status: "failed" satisfies RenderStatus,
      error_message: msg,
    });
    await emitEvent(renderId, "render_failed", { message: msg });
    await trackEvent(userId, "render_failed", {
      render_id: renderId,
      message: msg,
    });
  }
}
