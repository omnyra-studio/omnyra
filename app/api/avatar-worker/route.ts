/**
 * POST /api/avatar-worker  (execution kernel — internal only)
 *
 * Four-layer distributed execution contract per invocation:
 *
 *   LAYER 1 — Lease acquisition (execution authority)
 *     claimStage(): atomic UPDATE WHERE status='queued' AND locked_by IS NULL
 *     → returns null if already claimed (skip this invocation)
 *
 *   LAYER 2 — DAG resolution (structural correctness)
 *     resolveStageFromLedger(): reads completed stages from avatar_stage_ledger,
 *     determines the next executable stage via dependency graph.
 *
 *   LAYER 3 — Cost firewall (economic safety)
 *     checkCostFirewall(): blocks duplicate billing by request_hash.
 *
 *   LAYER 4 — Execution ledger (correctness + dedup)
 *     startLedgerEntry(): second dedup layer, marks stage 'running'.
 *
 * Pipeline (per job):
 *   tts     → Director Core plans N scenes, parallel TTS per scene
 *   animate → N parallel Kling calls (scene-specific visual prompts)
 *   lipsync → N parallel SyncLabs calls → ffmpeg stitch → validate → telemetry
 *
 * Body:    { jobId: string }
 * Returns: { acknowledged, stage?, skipped? }
 */

import { after } from "next/server";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import { tmpdir } from "os";
import { join } from "path";
import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { uploadArtifact, StorageValidationError } from "@/lib/storage-artifact";
import {
  type AvatarJob,
  type PipelineStage,
  claimStage,
  advanceToNextStage,
  completeJobWithLease,
  recordStageFailure,
  startLedgerEntry,
  completeLedgerEntry,
  failLedgerEntry,
  getCompletedStages,
  checkCostFirewall,
  registerCostIntent,
  markCostCharged,
  setPipelineStatus,
} from "@/lib/avatar-queue";
import {
  getDagNode,
  resolveStageFromLedger,
  ttsRequestHash,
  animateRequestHash,
  sceneLipsyncRequestHash,
} from "@/lib/avatar-pipeline";
import { animateImage, lipSyncVideo } from "@/lib/avatar-provider";
import { planScenes, type SceneSpec } from "@/lib/avatar-scene-planner";
import { loadCharacter, buildCharacterPromptSuffix, updateCharacterRefFrame } from "@/lib/character-registry";
import { lookupCachedPrompt, cachePrompt } from "@/lib/prompt-memory-cache";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const maxDuration = 800;

const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";

// ── Types ──────────────────────────────────────────────────────────────────────

interface AudioSegment {
  index:      number;
  text:       string;
  audio_url:  string;
  char_count: number;
}

// ── POST handler ───────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("x-worker-secret") !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { jobId?: string };
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid body" }, { status: 400 }); }

  const { jobId } = body;
  if (!jobId) return Response.json({ error: "jobId required" }, { status: 400 });

  console.log(`[WORKER_RECEIVED] jobId=${jobId}`);

  // ── LAYER 1: Atomic lease acquisition ─────────────────────────────────────
  const workerId = crypto.randomUUID();
  const job      = await claimStage(jobId, workerId);

  if (!job) {
    console.log(`[WORKER_RECEIVED] jobId=${jobId} claimStage=null — skipping`);
    return Response.json({ acknowledged: true, skipped: true });
  }

  console.log(`[CLAIM_SUCCESS] jobId=${jobId} stage=${job.stage} workerId=${workerId.slice(0, 8)}`);

  const origin = new URL(req.url).origin;

  after(async () => {
    const completedStages = await getCompletedStages(jobId);

    let currentStage: PipelineStage;
    try {
      currentStage = resolveStageFromLedger(job.stage, completedStages);
    } catch {
      console.log(`[avatar-worker] [${jobId}] [${workerId.slice(0, 8)}] dag: all stages done — releasing`);
      return;
    }

    const log = (msg: string) =>
      console.log(`[avatar-worker] [${jobId}] [${currentStage}] [${workerId.slice(0, 8)}] ${msg}`);

    log(`lease=acquired dag_stage=${currentStage}`);
    const t0 = Date.now();

    switch (currentStage) {
      case "tts":     await executeTtsStage(job, workerId, origin, log);     break;
      case "animate": await executeAnimateStage(job, workerId, origin, log); break;
      case "lipsync": await executeLipsyncStage(job, workerId, origin, log); break;
      default:        log(`unknown stage: ${currentStage}`);
    }

    log(`stage_end elapsed=${Date.now() - t0}ms`);
  });

  return Response.json({ acknowledged: true, stage: job.stage });
}

// ── Stage: TTS — Director Core scene planning + parallel synthesis ─────────────

async function executeTtsStage(
  job: AvatarJob,
  workerId: string,
  origin: string,
  log: (msg: string) => void,
): Promise<void> {
  const voiceId = job.input.voice_id || DEFAULT_VOICE_ID;
  const dagNode = getDagNode("tts");
  const reqHash = ttsRequestHash(voiceId, job.input.script);

  const { blocked, cachedOutputUrl: costCached } = await checkCostFirewall(job.id, "tts", reqHash);
  if (blocked && costCached) {
    log("cost_firewall HIT elevenlabs — reusing cached");
    return advanceFromTts(job, workerId, costCached, null, null, origin, log);
  }

  const { shouldSkip, cachedOutputUrl: ledgerCached } = await startLedgerEntry(job.id, "tts", workerId, reqHash);
  if (shouldSkip && ledgerCached) {
    log("ledger HIT tts — reusing cached");
    return advanceFromTts(job, workerId, ledgerCached, null, null, origin, log);
  }

  // ── Director Core: plan N scenes from script ──────────────────────────────
  void setPipelineStatus(job.id, "planning_scenes");
  log(`[DIRECTOR] planning scenes script_chars=${job.input.script.length}`);
  const directorT0 = Date.now();
  let scenes: SceneSpec[];
  try {
    scenes = await planScenes(job.input.script);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[DIRECTOR] ERROR: ${msg} — aborting`);
    await failLedgerEntry(job.id, "tts", workerId, msg);
    const { shouldRetry } = await recordStageFailure(job.id, workerId, "tts", msg, job.retry_count_per_stage ?? {});
    if (shouldRetry) await retrigger(origin, job.id, log);
    return;
  }
  log(`[DIRECTOR] scenes=${scenes.length} elapsed=${Date.now() - directorT0}ms`);

  // ── Prompt memory cache lookup (only for non-character jobs) ──────────────
  // Character jobs skip the cache entirely to avoid cross-character contamination.
  if (!job.input.character_id) {
    const cacheResults = await Promise.all(
      scenes.map(scene => lookupCachedPrompt(job.user_id, scene.shotType, scene.emotion)),
    );
    let cacheHits = 0;
    scenes = scenes.map((scene, i) => {
      const cached = cacheResults[i];
      if (cached) {
        cacheHits++;
        return { ...scene, visualPrompt: cached.visual_prompt };
      }
      return scene;
    });
    if (cacheHits > 0) log(`[CACHE] prompt cache hits=${cacheHits}/${scenes.length}`);
  }

  // ── Character consistency injection ───────────────────────────────────────
  if (job.input.character_id) {
    const character = await loadCharacter(job.input.character_id);
    if (character) {
      const suffix = buildCharacterPromptSuffix(character);
      scenes = scenes.map(scene => ({
        ...scene,
        visualPrompt: `${scene.visualPrompt}, ${suffix}`,
      }));
      log(`[CHARACTER] injected character="${character.name}" scenes=${scenes.length}`);
    } else {
      log(`[CHARACTER] character_id=${job.input.character_id} not found — skipping injection`);
    }
  }

  await registerCostIntent(job.id, "tts", "elevenlabs", reqHash, dagNode.creditEstimate);

  // ── Parallel TTS per scene ────────────────────────────────────────────────
  void setPipelineStatus(job.id, "generating_audio");
  const ttsT0 = Date.now();
  let rawSegments: Array<{ index: number; text: string; buffer: ArrayBuffer; char_count: number }>;

  try {
    rawSegments = await Promise.all(
      scenes.map(async (scene) => {
        log(`[TTS_SEGMENT_START] seg=${scene.index} chars=${scene.text.length}`);
        const t1  = Date.now();
        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
          {
            method:  "POST",
            headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json" },
            body:    JSON.stringify({
              text:           scene.text,
              model_id:       "eleven_turbo_v2",
              voice_settings: { stability: 0.35, similarity_boost: 0.75, style: 0.65, speed: 1.08 },
            }),
          },
        );
        if (!res.ok) {
          const errText = await res.text().catch(() => `HTTP ${res.status}`);
          throw new Error(`ElevenLabs seg=${scene.index} ${res.status}: ${errText.substring(0, 200)}`);
        }
        const buffer = await res.arrayBuffer();
        log(`[TTS_SEGMENT_DONE] seg=${scene.index} bytes=${buffer.byteLength} elapsed=${Date.now() - t1}ms`);
        return { index: scene.index, text: scene.text, buffer, char_count: scene.text.length };
      }),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`elevenlabs ERROR: ${msg}`);
    await failLedgerEntry(job.id, "tts", workerId, msg);
    const { shouldRetry } = await recordStageFailure(job.id, workerId, "tts", msg, job.retry_count_per_stage ?? {});
    if (shouldRetry) await retrigger(origin, job.id, log);
    return;
  }

  log(`[TTS_ALL_DONE] segments=${rawSegments.length} elapsed=${Date.now() - ttsT0}ms`);

  // ── Upload per-segment audio ───────────────────────────────────────────────
  let segments: AudioSegment[];
  try {
    segments = await Promise.all(
      rawSegments.map(async ({ index, text, buffer, char_count }) => {
        const audio_url = await uploadArtifact({
          jobId:        job.id,
          stage:        `tts_seg${index}`,
          buffer,
          contentType:  "audio/mpeg",
          extension:    "mp3",
          modelVersion: "eleven_turbo_v2",
        });
        return { index, text, audio_url, char_count };
      }),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const tag = err instanceof StorageValidationError ? "upload VALIDATION_ERROR" : "upload ERROR";
    log(`${tag}: ${msg}`);
    await failLedgerEntry(job.id, "tts", workerId, msg);
    const { shouldRetry } = await recordStageFailure(job.id, workerId, "tts", msg, job.retry_count_per_stage ?? {});
    if (shouldRetry) await retrigger(origin, job.id, log);
    return;
  }

  const audioUrl = segments[0].audio_url;
  await markCostCharged(job.id, "tts", reqHash, audioUrl);
  await completeLedgerEntry(job.id, "tts", workerId, audioUrl);
  log(`[TTS_COMPLETE] segments=${segments.length} audio_url=${audioUrl.substring(0, 80)}`);
  await advanceFromTts(job, workerId, audioUrl, segments, scenes, origin, log);
}

async function advanceFromTts(
  job:       AvatarJob,
  workerId:  string,
  audioUrl:  string,
  segments:  AudioSegment[] | null,
  scenes:    SceneSpec[]    | null,
  origin:    string,
  log:       (msg: string) => void,
): Promise<void> {
  const stageOutputs: Record<string, string> = {
    ...(job.stage_outputs ?? {}),
    audio_url: audioUrl,
  };
  if (segments) stageOutputs.audio_segments = JSON.stringify(segments);
  if (scenes)   stageOutputs.scene_specs    = JSON.stringify(scenes);

  const advanced = await advanceToNextStage(job.id, workerId, "animate", stageOutputs);
  if (!advanced) { log("lock_lost during transition — abandoning"); return; }
  log(`advanced → animate scenes=${scenes?.length ?? "unknown"}`);
  await retrigger(origin, job.id, log);
}

// ── Stage: Animate — parallel Kling with scene-specific visual prompts ─────────

async function executeAnimateStage(
  job: AvatarJob,
  workerId: string,
  origin: string,
  log: (msg: string) => void,
): Promise<void> {
  const audioUrl = job.stage_outputs?.audio_url;
  log(`[ANIMATE_START] audio_url_present=${!!audioUrl} image_url=${job.input.image_url.substring(0, 60)}`);
  if (!audioUrl) {
    const msg = "audio_url missing from stage_outputs";
    log(`ERROR: ${msg}`);
    await recordStageFailure(job.id, workerId, "animate", msg, job.retry_count_per_stage ?? {});
    return;
  }

  // Restore scene specs (may be absent on cache-hit retry paths)
  const specsJson  = job.stage_outputs?.scene_specs;
  const sceneSpecs: SceneSpec[] | null = specsJson
    ? (JSON.parse(specsJson) as SceneSpec[])
    : null;

  const dagNode = getDagNode("animate");
  const reqHash = animateRequestHash(job.input.image_url);

  // Cost firewall
  const { blocked, cachedOutputUrl: costCached } = await checkCostFirewall(job.id, "animate", reqHash);
  if (blocked && costCached) {
    log("cost_firewall HIT kling — recovering scene_video_urls");
    const existing = job.stage_outputs?.scene_video_urls;
    const urls     = existing ? (JSON.parse(existing) as string[]) : [costCached];
    return advanceFromAnimate(job, workerId, urls, sceneSpecs, origin, log);
  }

  // Execution ledger
  const { shouldSkip, cachedOutputUrl: ledgerCached } = await startLedgerEntry(job.id, "animate", workerId, reqHash);
  if (shouldSkip && ledgerCached) {
    log("ledger HIT animate — recovering scene_video_urls");
    const existing = job.stage_outputs?.scene_video_urls;
    const urls     = existing ? (JSON.parse(existing) as string[]) : [ledgerCached];
    return advanceFromAnimate(job, workerId, urls, sceneSpecs, origin, log);
  }

  const numScenes = sceneSpecs?.length ?? (job.input.plan === "studio" ? 6 : 3);

  await registerCostIntent(job.id, "animate", "kling", reqHash, dagNode.creditEstimate);
  void setPipelineStatus(job.id, "generating_animation");
  log(`[FAL_REQUEST] kling scenes=${numScenes} imageUrl=${job.input.image_url.substring(0, 80)}`);

  let sceneUrls: string[];
  try {
    const t0 = Date.now();

    sceneUrls = await Promise.all(
      Array.from({ length: numScenes }, (_, i) => {
        const visualPrompt = sceneSpecs?.[i]?.visualPrompt;
        log(`[SCENE_${i}_START] prompt_len=${visualPrompt?.length ?? 0}`);
        const t1 = Date.now();
        return animateImage(job.input.image_url, visualPrompt).then(url => {
          log(`[SCENE_${i}_DONE] elapsed=${Date.now() - t1}ms url=${url.substring(0, 60)}`);
          return url;
        });
      }),
    );

    log(`[ANIMATE_DONE] scenes=${numScenes} total_elapsed=${Date.now() - t0}ms`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`kling ERROR: ${msg}`);
    await failLedgerEntry(job.id, "animate", workerId, msg);
    const { shouldRetry } = await recordStageFailure(job.id, workerId, "animate", msg, job.retry_count_per_stage ?? {});
    if (shouldRetry) await retrigger(origin, job.id, log);
    return;
  }

  await markCostCharged(job.id, "animate", reqHash, sceneUrls[0]);
  await completeLedgerEntry(job.id, "animate", workerId, sceneUrls[0]);
  await advanceFromAnimate(job, workerId, sceneUrls, sceneSpecs, origin, log);
}

async function advanceFromAnimate(
  job:        AvatarJob,
  workerId:   string,
  sceneUrls:  string[],
  sceneSpecs: SceneSpec[] | null,
  origin:     string,
  log:        (msg: string) => void,
): Promise<void> {
  const stageOutputs: Record<string, string> = {
    ...(job.stage_outputs ?? {}),
    animated_video_url: sceneUrls[0],
    scene_video_urls:   JSON.stringify(sceneUrls),
  };
  if (sceneSpecs) stageOutputs.scene_specs = JSON.stringify(sceneSpecs);

  const advanced = await advanceToNextStage(job.id, workerId, "lipsync", stageOutputs);
  if (!advanced) { log("lock_lost during transition — abandoning"); return; }
  log(`advanced → lipsync scenes=${sceneUrls.length}`);
  await retrigger(origin, job.id, log);
}

// ── Stage: Lipsync — parallel per-scene → stitch → validate → telemetry ──────

async function executeLipsyncStage(
  job: AvatarJob,
  workerId: string,
  origin: string,
  log: (msg: string) => void,
): Promise<void> {
  const stageT0 = Date.now();

  // ── Resolve per-scene and per-segment data ────────────────────────────────
  const sceneVideoUrls: string[] = job.stage_outputs?.scene_video_urls
    ? (JSON.parse(job.stage_outputs.scene_video_urls) as string[])
    : job.stage_outputs?.animated_video_url
      ? [job.stage_outputs.animated_video_url]
      : [];

  if (!sceneVideoUrls.length) {
    const msg = "stage_outputs missing scene_video_urls and animated_video_url";
    log(`ERROR: ${msg}`);
    await recordStageFailure(job.id, workerId, "lipsync", msg, job.retry_count_per_stage ?? {});
    return;
  }

  const audioSegments: AudioSegment[] = job.stage_outputs?.audio_segments
    ? (JSON.parse(job.stage_outputs.audio_segments) as AudioSegment[])
    : sceneVideoUrls.map((_, i) => ({
        index: i, text: "", audio_url: job.stage_outputs?.audio_url ?? "", char_count: 0,
      }));

  if (!audioSegments[0]?.audio_url) {
    const msg = "stage_outputs missing audio_segments and audio_url";
    log(`ERROR: ${msg}`);
    await recordStageFailure(job.id, workerId, "lipsync", msg, job.retry_count_per_stage ?? {});
    return;
  }

  const numScenes = sceneVideoUrls.length;

  // ── Synchronize: zip scene[i] ↔ segment[i] ───────────────────────────────
  const pairs = Array.from({ length: numScenes }, (_, i) => ({
    sceneUrl:    sceneVideoUrls[i],
    segAudioUrl: audioSegments[Math.min(i, audioSegments.length - 1)].audio_url,
    index:       i,
  }));

  log(`[LIPSYNC_SYNC] scenes=${numScenes} segments=${audioSegments.length}`);

  // ── Cost firewall / ledger ────────────────────────────────────────────────
  const dagNode = getDagNode("lipsync");
  const reqHash = sceneLipsyncRequestHash(sceneVideoUrls[0], audioSegments[0].audio_url, 0);

  const { blocked, cachedOutputUrl: costCached } = await checkCostFirewall(job.id, "lipsync", reqHash);
  if (blocked && costCached) {
    log("cost_firewall HIT synclabs — reusing cached");
    await completeLedgerEntry(job.id, "lipsync", workerId, costCached);
    await completeJobWithLease(job.id, workerId, costCached, sceneVideoUrls[0]);
    log("pipeline COMPLETE (cost_firewall cache)");
    return;
  }

  const { shouldSkip, cachedOutputUrl: ledgerCached } = await startLedgerEntry(job.id, "lipsync", workerId, reqHash);
  if (shouldSkip && ledgerCached) {
    log("ledger HIT lipsync — reusing cached");
    await completeJobWithLease(job.id, workerId, ledgerCached, sceneVideoUrls[0]);
    log("pipeline COMPLETE (ledger cache)");
    return;
  }

  await registerCostIntent(job.id, "lipsync", "synclabs", reqHash, dagNode.creditEstimate);

  // ── Parallel per-scene lipsync ────────────────────────────────────────────
  void setPipelineStatus(job.id, "syncing_lips");
  const lipsyncT0 = Date.now();
  log(`[LIPSYNC_PARALLEL_START] scenes=${numScenes}`);

  let lipsyncedUrls: string[];
  try {
    lipsyncedUrls = await Promise.all(
      pairs.map(async ({ sceneUrl, segAudioUrl, index: i }) => {
        log(`[LIPSYNC_SCENE_${i}_START]`);
        const t1  = Date.now();
        const url = await lipSyncVideo(sceneUrl, segAudioUrl);
        log(`[LIPSYNC_SCENE_${i}_DONE] elapsed=${Date.now() - t1}ms url=${url.substring(0, 60)}`);
        return url;
      }),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const e   = err as { name?: string; status?: number; body?: unknown; requestId?: string };
    log(`synclabs ERROR: ${msg}`);
    log(`synclabs ERROR_CLASS=${e.name ?? "unknown"} STATUS=${e.status ?? "none"}`);
    log(`synclabs ERROR_BODY=${JSON.stringify(e.body ?? null)}`);
    log(`synclabs REQUEST_ID=${e.requestId ?? "none"}`);
    await failLedgerEntry(job.id, "lipsync", workerId, msg);
    const { shouldRetry } = await recordStageFailure(job.id, workerId, "lipsync", msg, job.retry_count_per_stage ?? {});
    if (shouldRetry) await retrigger(origin, job.id, log);
    return;
  }

  const lipsyncMs = Date.now() - lipsyncT0;
  log(`[LIPSYNC_PARALLEL_DONE] elapsed=${lipsyncMs}ms scenes=${lipsyncedUrls.length}`);

  // ── Stitch lipsynced clips ────────────────────────────────────────────────
  void setPipelineStatus(job.id, "stitching");
  const stitchT0    = Date.now();
  const tmpDir      = tmpdir();
  const sid         = job.id.replace(/-/g, "").substring(0, 8);
  const scenePaths  = lipsyncedUrls.map((_, i) => join(tmpDir, `lp-${sid}-s${i}.mp4`));
  const concatPath  = join(tmpDir, `lp-${sid}-concat.txt`);
  const outputPath  = join(tmpDir, `lp-${sid}-out.mp4`);
  const cleanupPaths = [...scenePaths, concatPath, outputPath];

  let finalVideoUrl: string;
  let outputBytes = 0;

  try {
    // Download lipsynced clips in parallel
    const sceneBuffers = await Promise.all(
      lipsyncedUrls.map(async (url, i) => {
        const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        if (!r.ok) throw new Error(`lipsync clip download ${r.status} scene=${i}`);
        return Buffer.from(await r.arrayBuffer());
      }),
    );

    for (let i = 0; i < sceneBuffers.length; i++) {
      writeFileSync(scenePaths[i], sceneBuffers[i]);
    }

    let finalPath: string;
    if (sceneBuffers.length === 1) {
      finalPath = scenePaths[0];
    } else {
      const concatContent = scenePaths.map(p => `file '${p.replace(/\\/g, "/")}'`).join("\n");
      writeFileSync(concatPath, concatContent);
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(concatPath)
          .inputOptions(["-f", "concat", "-safe", "0"])
          .outputOptions(["-c", "copy"])
          .output(outputPath)
          .on("stderr", (line: string) => log(`[ffmpeg:stderr] ${line}`))
          .on("end", () => resolve())
          .on("error", (err: Error) => reject(new Error(`FFmpeg stitch failed: ${err.message}`)))
          .run();
      });
      finalPath = outputPath;
    }

    // ── Validate output integrity ──────────────────────────────────────────
    const outputBuffer = readFileSync(finalPath);
    outputBytes = outputBuffer.byteLength;
    if (outputBytes === 0) throw new Error("FFmpeg stitch produced 0-byte output");
    log(`[STITCH_DONE] bytes=${outputBytes} elapsed=${Date.now() - stitchT0}ms`);

    // ── Upload final video ─────────────────────────────────────────────────
    finalVideoUrl = await uploadArtifact({
      jobId:        job.id,
      stage:        "lipsync",
      buffer:       outputBuffer,
      contentType:  "video/mp4",
      extension:    "mp4",
      modelVersion: `synclabs-1.9-x${numScenes}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`stitch/upload ERROR: ${msg}`);
    await failLedgerEntry(job.id, "lipsync", workerId, msg);
    const { shouldRetry } = await recordStageFailure(job.id, workerId, "lipsync", msg, job.retry_count_per_stage ?? {});
    if (shouldRetry) await retrigger(origin, job.id, log);
    return;
  } finally {
    for (const p of cleanupPaths) { try { unlinkSync(p); } catch { /* already gone */ } }
  }

  const stitchMs  = Date.now() - stitchT0;
  const totalMs   = Date.now() - stageT0;

  // ── Telemetry report ───────────────────────────────────────────────────────
  log(
    `[TELEMETRY] ` +
    `scenes=${numScenes} ` +
    `lipsync_parallel_ms=${lipsyncMs} ` +
    `stitch_ms=${stitchMs} ` +
    `output_bytes=${outputBytes} ` +
    `total_lipsync_stage_ms=${totalMs}`,
  );

  // ── Commit ─────────────────────────────────────────────────────────────────
  await markCostCharged(job.id, "lipsync", reqHash, finalVideoUrl);
  await completeLedgerEntry(job.id, "lipsync", workerId, finalVideoUrl);
  await completeJobWithLease(job.id, workerId, finalVideoUrl, sceneVideoUrls[0]);

  // Update character ref_frame_url with the first animated scene for future consistency
  if (job.input.character_id && sceneVideoUrls[0]) {
    void updateCharacterRefFrame(job.input.character_id, sceneVideoUrls[0]);
    log(`[CHARACTER] updated ref_frame character_id=${job.input.character_id}`);
  }

  // Populate prompt memory cache for non-character jobs (score=1.0 on success)
  if (!job.input.character_id) {
    const specsJson = job.stage_outputs?.scene_specs;
    if (specsJson) {
      const completedSpecs = JSON.parse(specsJson) as SceneSpec[];
      void Promise.all(
        completedSpecs.map(s => cachePrompt(job.user_id, s.shotType, s.emotion, s.visualPrompt, 1.0)),
      ).catch(e => log(`[CACHE] populate error: ${(e as Error).message}`));
      log(`[CACHE] queued ${completedSpecs.length} prompt(s) for caching`);
    }
  }

  log("pipeline COMPLETE");
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function retrigger(origin: string, jobId: string, log: (msg: string) => void): Promise<void> {
  const url = `${origin}/api/avatar-worker`;
  log(`[RETRIGGER_START] url=${url} jobId=${jobId} secret_set=${!!process.env.CRON_SECRET}`);
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: {
        "Content-Type":    "application/json",
        "x-worker-secret": process.env.CRON_SECRET ?? "",
      },
      body: JSON.stringify({ jobId }),
    });
    const body = await res.text().catch(() => "");
    log(`[RETRIGGER_RESPONSE] status=${res.status} ok=${res.ok} body=${body.substring(0, 200)}`);
  } catch (e) {
    log(`[RETRIGGER_RESPONSE] fetch_threw: ${(e as Error)?.message}`);
  }
}
