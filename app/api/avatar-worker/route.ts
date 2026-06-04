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
 *   tts     → Director Core plans N scenes, parallel TTS per scene → audio_segments
 *   animate → bypass (Kling removed; near-instant ledger entry only)
 *   lipsync → Hedra: original image + stitched audio → talking avatar video
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
import { supabaseAdmin } from "@/lib/supabase/admin";
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
  hedraRequestHash,
} from "@/lib/avatar-pipeline";
import { generateHedraAvatar } from "@/lib/providers/hedra";
import { toSignedUrlForProvider } from "@/lib/avatar/asset-validator";
import { planScenes, type SceneSpec, type CreatorContext } from "@/lib/avatar-scene-planner";
import { loadCharacter, buildCharacterPromptSuffix, updateCharacterRefFrame } from "@/lib/character-registry";
import { loadCreatorProfile } from "@/lib/creator-profile";
import { lookupCachedPrompt, cachePrompt } from "@/lib/prompt-memory-cache";
import { getExecutionPlan } from "@/lib/execution-control";
import {
  assertNoLegacyLipsync,
  assertDirectorPipelineOnly,
  LegacyPipelineViolationError,
} from "@/lib/guards/legacy-pipeline-guard";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const maxDuration = 300;

const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";

// ── Performance Engine: energy → ElevenLabs voice settings ────────────────────

function voiceSettingsForScene(energy: number, pacing: string) {
  const e = Math.max(1, Math.min(5, Math.round(energy)));
  // energy 1 = reflective/calm → energy 5 = urgent/intense
  const stability        = 0.60 - (e - 1) * 0.10;  // 0.60 → 0.20
  const style            = 0.30 + (e - 1) * 0.15;  // 0.30 → 0.90
  const baseSpeed        = 0.90 + (e - 1) * 0.055; // 0.90 → 1.12
  const speed = pacing === "fast" ? baseSpeed + 0.06 :
                pacing === "slow" ? baseSpeed - 0.06 : baseSpeed;
  return { stability, similarity_boost: 0.75, style, speed: Math.round(speed * 100) / 100 };
}

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

  // ── Execution Guardrail Layer ────────────────────────────────────────────────
  try {
    assertNoLegacyLipsync(body, "avatar-worker:POST");
  } catch (e) {
    if (e instanceof LegacyPipelineViolationError) {
      return Response.json(
        { error: "FAILED_ARCHITECTURE_VIOLATION", message: e.message },
        { status: 400 },
      );
    }
    throw e;
  }

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

    assertDirectorPipelineOnly(currentStage, `avatar-worker:after:${jobId}`);
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

  // ── Execution control: cap scene count based on system health ────────────
  const execPlan = await getExecutionPlan();
  // Plan entitlement floor: studio targets 6 scenes (60s), others target 3 (30s).
  // We take the max of the execution health cap and the plan minimum.
  const planFloor = job.input.plan === "studio" ? 6 : 3;
  const effectiveMaxScenes = Math.max(planFloor, execPlan.maxScenes);
  log(`[EXEC_CONTROL] mode=${execPlan.mode} maxScenes=${execPlan.maxScenes} planFloor=${planFloor} effective=${effectiveMaxScenes} reason=${execPlan.reason}`);

  // ── Load creator + character memory (Director Core context) ───────────────
  const [creatorProfile, characterForCtx] = await Promise.all([
    loadCreatorProfile(job.user_id),
    job.input.character_id ? loadCharacter(job.input.character_id) : Promise.resolve(null),
  ]);
  const directorCtx: CreatorContext = { profile: creatorProfile, character: characterForCtx };
  log(`[DIRECTOR_CTX] profile=${!!creatorProfile} character=${!!characterForCtx} quality=${creatorProfile?.quality_score ?? "n/a"}`);

  // ── Director Core: plan N scenes from script ──────────────────────────────
  void setPipelineStatus(job.id, "planning_scenes");
  log(`[DIRECTOR] planning scenes script_chars=${job.input.script.length}`);
  const directorT0 = Date.now();
  let scenes: SceneSpec[];
  try {
    scenes = await planScenes(job.input.script, effectiveMaxScenes, directorCtx);
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
  if (characterForCtx) {
    const suffix = buildCharacterPromptSuffix(characterForCtx);
    scenes = scenes.map(scene => ({
      ...scene,
      visualPrompt: `${scene.visualPrompt}, ${suffix}`,
    }));
    log(`[CHARACTER] injected character="${characterForCtx.name}" scenes=${scenes.length}`);
  } else if (job.input.character_id) {
    log(`[CHARACTER] character_id=${job.input.character_id} not found — skipping injection`);
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
              voice_settings: voiceSettingsForScene(scene.energy ?? 3, scene.pacing ?? "measured"),
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

// ── Stage: Animate — bypass (Kling skipped; Hedra handles image+audio directly) ─

async function executeAnimateStage(
  job: AvatarJob,
  workerId: string,
  origin: string,
  log: (msg: string) => void,
): Promise<void> {
  // Kling is bypassed. Register a near-instant ledger entry so the DAG resolver
  // sees animate as completed, then advance directly to the Hedra stage.
  log(`[ANIMATE_BYPASS] Kling skipped — pipeline: TTS → Hedra`);

  const reqHash = animateRequestHash(job.input.image_url);
  const { shouldSkip } = await startLedgerEntry(job.id, "animate", workerId, reqHash);
  if (!shouldSkip) {
    await completeLedgerEntry(job.id, "animate", workerId, "hedra-bypass");
  }

  const stageOutputs = { ...(job.stage_outputs ?? {}) };
  const advanced = await advanceToNextStage(job.id, workerId, "lipsync", stageOutputs);
  if (!advanced) { log("lock_lost during bypass — abandoning"); return; }
  log("advanced → lipsync (Hedra)");
  await retrigger(origin, job.id, log);
}

// ── Stage: Lipsync (Hedra) — image + stitched audio → talking avatar video ────

async function executeLipsyncStage(
  job: AvatarJob,
  workerId: string,
  origin: string,
  log: (msg: string) => void,
): Promise<void> {
  const stageT0 = Date.now();

  // ── Resolve audio ─────────────────────────────────────────────────────────
  const audioSegments: AudioSegment[] = job.stage_outputs?.audio_segments
    ? (JSON.parse(job.stage_outputs.audio_segments) as AudioSegment[])
    : [];

  const firstAudioUrl = job.stage_outputs?.audio_url ?? audioSegments[0]?.audio_url ?? "";
  if (!firstAudioUrl) {
    const msg = "stage_outputs missing audio_url and audio_segments";
    log(`ERROR: ${msg}`);
    await recordStageFailure(job.id, workerId, "lipsync", msg, job.retry_count_per_stage ?? {});
    return;
  }

  // Stitch audio segments into one file if there are multiple, otherwise use
  // the single audio URL directly.
  let combinedAudioUrl: string;
  if (audioSegments.length <= 1) {
    combinedAudioUrl = firstAudioUrl;
    log(`[HEDRA_AUDIO] single segment — using audio_url directly`);
  } else {
    log(`[HEDRA_AUDIO] stitching ${audioSegments.length} segments`);
    const stitchT0  = Date.now();
    const tmpDir    = tmpdir();
    const sid       = job.id.replace(/-/g, "").substring(0, 8);
    const segPaths  = audioSegments.map((_, i) => join(tmpDir, `ha-${sid}-s${i}.mp3`));
    const concatPath = join(tmpDir, `ha-${sid}-concat.txt`);
    const outPath   = join(tmpDir, `ha-${sid}-out.mp3`);
    const cleanup   = [...segPaths, concatPath, outPath];

    try {
      const buffers = await Promise.all(
        audioSegments.map(async (seg, i) => {
          const r = await fetch(seg.audio_url, { signal: AbortSignal.timeout(30_000) });
          if (!r.ok) throw new Error(`audio seg ${i} download ${r.status}`);
          return Buffer.from(await r.arrayBuffer());
        }),
      );

      for (let i = 0; i < buffers.length; i++) writeFileSync(segPaths[i], buffers[i]);

      const concatContent = segPaths.map(p => `file '${p.replace(/\\/g, "/")}'`).join("\n");
      writeFileSync(concatPath, concatContent);

      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(concatPath)
          .inputOptions(["-f", "concat", "-safe", "0"])
          .outputOptions(["-c", "copy"])
          .output(outPath)
          .on("end", () => resolve())
          .on("error", (err: Error) => reject(new Error(`ffmpeg audio stitch: ${err.message}`)))
          .run();
      });

      const stitchedBuffer = readFileSync(outPath);
      if (stitchedBuffer.byteLength === 0) throw new Error("ffmpeg audio stitch produced 0-byte output");

      combinedAudioUrl = await uploadArtifact({
        jobId:        job.id,
        stage:        "tts_combined",
        buffer:       stitchedBuffer,
        contentType:  "audio/mpeg",
        extension:    "mp3",
        modelVersion: "eleven_turbo_v2",
      });
      log(`[HEDRA_AUDIO] stitched elapsed=${Date.now() - stitchT0}ms url=${combinedAudioUrl.substring(0, 80)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`audio stitch ERROR: ${msg}`);
      await failLedgerEntry(job.id, "lipsync", workerId, msg);
      const { shouldRetry } = await recordStageFailure(job.id, workerId, "lipsync", msg, job.retry_count_per_stage ?? {});
      if (shouldRetry) await retrigger(origin, job.id, log);
      return;
    } finally {
      for (const p of cleanup) { try { unlinkSync(p); } catch { /* already gone */ } }
    }
  }

  // ── Cost firewall / ledger ────────────────────────────────────────────────
  const dagNode = getDagNode("lipsync");
  const reqHash = hedraRequestHash(job.input.image_url, combinedAudioUrl);

  const { blocked, cachedOutputUrl: costCached } = await checkCostFirewall(job.id, "lipsync", reqHash);
  if (blocked && costCached) {
    log("cost_firewall HIT hedra — reusing cached");
    await completeLedgerEntry(job.id, "lipsync", workerId, costCached);
    await completeJobWithLease(job.id, workerId, costCached, costCached);
    log("pipeline COMPLETE (cost_firewall cache)");
    return;
  }

  const { shouldSkip, cachedOutputUrl: ledgerCached } = await startLedgerEntry(job.id, "lipsync", workerId, reqHash);
  if (shouldSkip && ledgerCached) {
    log("ledger HIT hedra — reusing cached");
    await completeJobWithLease(job.id, workerId, ledgerCached, ledgerCached);
    log("pipeline COMPLETE (ledger cache)");
    return;
  }

  await registerCostIntent(job.id, "lipsync", "hedra", reqHash, dagNode.creditEstimate);

  // ── Hedra generation ──────────────────────────────────────────────────────
  void setPipelineStatus(job.id, "generating_avatar");
  log(`[PROVIDER_SELECTION] provider=hedra stage=lipsync`);
  const hedraT0 = Date.now();

  // Sign both URLs immediately before the Hedra call.
  // job.input.image_url is a raw public or client-supplied URL — it MUST be
  // converted to a fresh signed URL so Hedra can fetch it even if the bucket
  // is not publicly accessible.  combinedAudioUrl comes from uploadArtifact
  // which returns publicUrl; same treatment required.
  let signedImageUrl: string;
  let signedAudioUrl: string;
  try {
    [signedImageUrl, signedAudioUrl] = await Promise.all([
      toSignedUrlForProvider(job.input.image_url),
      toSignedUrlForProvider(combinedAudioUrl),
    ]);
  } catch (signErr) {
    const msg = signErr instanceof Error ? signErr.message : String(signErr);
    log(`[HEDRA_PRECHECK_FAILED] URL signing failed: ${msg}`);
    await failLedgerEntry(job.id, "lipsync", workerId, msg);
    const { shouldRetry } = await recordStageFailure(job.id, workerId, "lipsync", `HEDRA_PRECHECK_FAILED: ${msg}`, job.retry_count_per_stage ?? {});
    if (shouldRetry) await retrigger(origin, job.id, log);
    return;
  }

  log(`[HEDRA_START] image_len=${signedImageUrl.length} audio_len=${signedAudioUrl.length}`);

  // ── Cost safety: resume existing generation if one was already submitted ──
  // If a previous invocation submitted to Hedra but timed out during polling,
  // the generation_id was persisted to stage_outputs. Reuse it — no re-submit.
  const resumeGenerationId = (job.stage_outputs as Record<string, string> | undefined)
    ?.hedra_generation_id ?? undefined;
  if (resumeGenerationId) {
    log(`[HEDRA_RESUME] found persisted generation_id=${resumeGenerationId} — skipping re-submit`);
  }

  let finalVideoUrl: string;
  try {
    const result = await generateHedraAvatar(
      {
        image_url:            signedImageUrl,
        audio_url:            signedAudioUrl,
        resolution:           "720p",
        _jobId:               job.id,
        _resumeGenerationId:  resumeGenerationId,
      },
      // Persist the generation ID immediately after submit, before polling.
      // Survives timeouts: next retry will find this ID and resume polling.
      async (generationId: string) => {
        await supabaseAdmin
          .from("avatar_jobs")
          .update({
            stage_outputs: {
              ...(job.stage_outputs ?? {}),
              hedra_generation_id: generationId,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        log(`[HEDRA_GENERATION_ID_PERSISTED] ${generationId}`);
      },
    );
    finalVideoUrl = result.video_url;
    log(`[HEDRA_DONE] elapsed=${Date.now() - hedraT0}ms request_id=${result.request_id} video_url_len=${finalVideoUrl.length}`);
  } catch (err) {
    const e    = err instanceof Error ? err : new Error(String(err));
    const node = e as NodeJS.ErrnoException & { cause?: { code?: string; message?: string } };
    log(`[HEDRA_FAILED] ${e.message}`);
    log(`[HEDRA_DEBUG] name=${e.name} code=${node.code ?? "none"} cause_code=${node.cause?.code ?? "none"} cause_msg=${node.cause?.message ?? "none"}`);
    const msg = e.message;
    await failLedgerEntry(job.id, "lipsync", workerId, msg);
    const { shouldRetry } = await recordStageFailure(job.id, workerId, "lipsync", msg, job.retry_count_per_stage ?? {});
    if (shouldRetry) await retrigger(origin, job.id, log);
    return;
  }

  const totalMs = Date.now() - stageT0;
  const hedraMs = Date.now() - hedraT0;
  log(`[TELEMETRY] hedra_ms=${hedraMs} total_stage_ms=${totalMs}`);

  // ── Persist Hedra-specific metadata ────────────────────────────────────────
  void supabaseAdmin
    .from("avatar_jobs")
    .update({
      stage_outputs: {
        ...(job.stage_outputs ?? {}),
        hedra_output_url:    finalVideoUrl,
        hedra_latency_ms:    String(hedraMs),
        // hedra_generation_id already written by onGenerationStarted callback
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  // ── Commit ─────────────────────────────────────────────────────────────────
  // Wrapped — a Supabase failure here after a successful Hedra generation must
  // not leave the job stuck in "processing" with the credit already charged.
  try {
    await markCostCharged(job.id, "lipsync", reqHash, finalVideoUrl);
    await completeLedgerEntry(job.id, "lipsync", workerId, finalVideoUrl);
    await completeJobWithLease(job.id, workerId, finalVideoUrl, finalVideoUrl);
  } catch (commitErr) {
    const msg = commitErr instanceof Error ? commitErr.message : String(commitErr);
    log(`COMMIT_ERROR: ${msg} — Hedra succeeded but DB commit failed`);
    // Trigger retry so the job isn't permanently stuck.
    // The generation_id is persisted in stage_outputs — retry will resume polling
    // and re-attempt the commit without re-calling Hedra.
    const { shouldRetry } = await recordStageFailure(
      job.id, workerId, "lipsync", `COMMIT_ERROR: ${msg}`, job.retry_count_per_stage ?? {},
    ).catch(() => ({ shouldRetry: false }));
    if (shouldRetry) await retrigger(origin, job.id, log);
    throw commitErr;
  }

  // Update character ref_frame_url
  if (job.input.character_id) {
    void updateCharacterRefFrame(job.input.character_id, finalVideoUrl);
    log(`[CHARACTER] updated ref_frame character_id=${job.input.character_id}`);
  }

  // Populate prompt memory cache for non-character jobs
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
