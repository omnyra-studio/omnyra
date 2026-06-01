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
 *     Detects + corrects job.stage / ledger desync.
 *
 *   LAYER 3 — Cost firewall (economic safety)
 *     checkCostFirewall(): checks external_api_cost_ledger for request_hash.
 *     Blocks execution if this exact API call was previously charged.
 *     Cached output_url is used directly — no API call.
 *
 *   LAYER 4 — Execution ledger (correctness + dedup)
 *     startLedgerEntry(): checks avatar_stage_ledger for completed status.
 *     Provides second line of defense after cost firewall.
 *     Marks stage as 'running' before API call.
 *
 * Per-stage execution sequence:
 *   registerCostIntent → executeAPICall → markCostCharged → completeLedgerEntry
 *   → advanceToNextStage → retrigger
 *
 * Body:    { jobId: string }
 * Returns: { acknowledged, stage?, skipped? }
 */

import { after } from "next/server";
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
} from "@/lib/avatar-queue";
import {
  getDagNode,
  resolveStageFromLedger,
  ttsRequestHash,
  animateRequestHash,
  lipsyncRequestHash,
} from "@/lib/avatar-pipeline";
import { animateImage, lipSyncVideo } from "@/lib/avatar-provider";

export const maxDuration = 300;

const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";

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
  const job = await claimStage(jobId, workerId);

  if (!job) {
    console.log(`[WORKER_RECEIVED] jobId=${jobId} claimStage=null (already claimed or not queued) — skipping`);
    return Response.json({ acknowledged: true, skipped: true });
  }

  console.log(`[CLAIM_SUCCESS] jobId=${jobId} stage=${job.stage} workerId=${workerId.slice(0, 8)}`);


  const origin = new URL(req.url).origin;

  // ── Execute one stage inside after() ───────────────────────────────────────
  after(async () => {
    // ── LAYER 2: DAG resolution ───────────────────────────────────────────
    // Reads live ledger state — authoritative over job.stage field
    const completedStages = await getCompletedStages(jobId);

    let currentStage: PipelineStage;
    try {
      currentStage = resolveStageFromLedger(job.stage, completedStages);
    } catch (err) {
      // All stages completed — this claim should not have happened
      // (job completion write raced with this worker's claim)
      console.log(
        `[avatar-worker] [${jobId}] [${workerId.slice(0, 8)}] dag: all stages done — releasing lease`,
      );
      return;
    }

    const log = (msg: string) =>
      console.log(`[avatar-worker] [${jobId}] [${currentStage}] [${workerId.slice(0, 8)}] ${msg}`);

    log(`lease=acquired expires=${job.lease_expires_at} dag_stage=${currentStage}`);
    const t0 = Date.now();

    switch (currentStage) {
      case "tts":
        await executeTtsStage(job, workerId, origin, log);
        break;
      case "animate":
        await executeAnimateStage(job, workerId, origin, log);
        break;
      case "lipsync":
        await executeLipsyncStage(job, workerId, origin, log);
        break;
      default:
        log(`unknown stage: ${currentStage}`);
    }

    log(`stage_end elapsed=${Date.now() - t0}ms`);
  });

  return Response.json({ acknowledged: true, stage: job.stage });
}

// ── Stage execution kernel ─────────────────────────────────────────────────────
//
// Each stage follows the same 7-step pattern:
//   1. Compute deterministic request hash from immutable inputs
//   2. LAYER 3: Cost firewall — return cached output if already charged
//   3. LAYER 4: Ledger check — return cached output if stage completed
//   4. Register cost intent (before API call)
//   5. Call external API exactly once
//   6. Commit: markCostCharged → completeLedgerEntry (in order)
//   7. Advance stage + trigger next worker

// ── Stage: TTS (ElevenLabs + Supabase Storage) ─────────────────────────────

async function executeTtsStage(
  job: AvatarJob,
  workerId: string,
  origin: string,
  log: (msg: string) => void,
): Promise<void> {
  const voiceId  = job.input.voice_id || DEFAULT_VOICE_ID;
  const dagNode  = getDagNode("tts");
  const reqHash  = ttsRequestHash(voiceId, job.input.script);

  // Cost firewall — blocks duplicate ElevenLabs billing by request hash
  const { blocked, cachedOutputUrl: costCached } = await checkCostFirewall(
    job.id, "tts", reqHash,
  );
  if (blocked && costCached) {
    log(`cost_firewall HIT provider=elevenlabs — reusing cached audio_url`);
    return advanceFromTts(job, workerId, costCached, origin, log);
  }

  // Execution ledger — second dedup layer
  const { shouldSkip, cachedOutputUrl: ledgerCached } = await startLedgerEntry(
    job.id, "tts", workerId, reqHash,
  );
  if (shouldSkip && ledgerCached) {
    log(`ledger HIT tts — reusing cached audio_url`);
    return advanceFromTts(job, workerId, ledgerCached, origin, log);
  }

  // ── ElevenLabs TTS ────────────────────────────────────────────────────────
  await registerCostIntent(job.id, "tts", "elevenlabs", reqHash, dagNode.creditEstimate);
  log(`elevenlabs START voiceId=${voiceId} chars=${job.input.script.length}`);

  let audioBuffer: ArrayBuffer;
  try {
    const t0 = Date.now();
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method:  "POST",
        headers: {
          "xi-api-key":   process.env.ELEVENLABS_API_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text:           job.input.script,
          model_id:       "eleven_turbo_v2",
          voice_settings: { stability: 0.35, similarity_boost: 0.75, style: 0.65, speed: 1.08 },
        }),
      },
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(`ElevenLabs ${res.status}: ${errText.substring(0, 200)}`);
    }
    audioBuffer = await res.arrayBuffer();
    log(`elevenlabs SUCCESS bytes=${audioBuffer.byteLength} elapsed=${Date.now() - t0}ms`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`elevenlabs ERROR: ${msg}`);
    await failLedgerEntry(job.id, "tts", workerId, msg);
    const { shouldRetry } = await recordStageFailure(
      job.id, workerId, "tts", msg, job.retry_count_per_stage ?? {},
    );
    if (shouldRetry) await retrigger(origin, job.id, log);
    return;
  }

  // ── Storage upload — content-addressed, idempotent ───────────────────────
  let audioUrl: string;
  try {
    const t0 = Date.now();
    audioUrl = await uploadArtifact({
      jobId:        job.id,
      stage:        "tts",
      buffer:       audioBuffer,
      contentType:  "audio/mpeg",
      extension:    "mp3",
      modelVersion: "eleven_turbo_v2",
    });
    log(`upload SUCCESS elapsed=${Date.now() - t0}ms`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const logTag = err instanceof StorageValidationError ? "upload VALIDATION_ERROR" : "upload ERROR";
    log(`${logTag}: ${msg}`);
    await failLedgerEntry(job.id, "tts", workerId, msg);
    const { shouldRetry } = await recordStageFailure(
      job.id, workerId, "tts", msg, job.retry_count_per_stage ?? {},
    );
    if (shouldRetry) await retrigger(origin, job.id, log);
    return;
  }

  // Commit: cost first, then ledger — ordering ensures cost is always recorded
  await markCostCharged(job.id, "tts", reqHash, audioUrl);
  await completeLedgerEntry(job.id, "tts", workerId, audioUrl);
  log(`[TTS_COMPLETE] audioUrl=${audioUrl.substring(0, 80)}`);
  await advanceFromTts(job, workerId, audioUrl, origin, log);
}

async function advanceFromTts(
  job: AvatarJob,
  workerId: string,
  audioUrl: string,
  origin: string,
  log: (msg: string) => void,
): Promise<void> {
  const stageOutputs = { ...(job.stage_outputs ?? {}), audio_url: audioUrl };
  const advanced = await advanceToNextStage(job.id, workerId, "animate", stageOutputs);
  log(`[ADVANCE_TO_ANIMATE] advanced=${advanced} audio_url_present=${!!stageOutputs.audio_url}`);
  if (!advanced) { log("lock_lost during transition — abandoning"); return; }
  log("advanced → animate");
  await retrigger(origin, job.id, log);
}

// ── Stage: Animate (Kling v2.1 pro image-to-video) ──────────────────────────

async function executeAnimateStage(
  job: AvatarJob,
  workerId: string,
  origin: string,
  log: (msg: string) => void,
): Promise<void> {
  const audioUrl = job.stage_outputs?.audio_url;
  log(`[ANIMATE_START] audio_url_present=${!!audioUrl} image_url=${job.input.image_url.substring(0, 60)}`);
  if (!audioUrl) {
    const msg = "audio_url missing from stage_outputs — TTS stage did not persist output";
    log(`ERROR: ${msg}`);
    await recordStageFailure(job.id, workerId, "animate", msg, job.retry_count_per_stage ?? {});
    return;
  }

  const dagNode = getDagNode("animate");
  const reqHash = animateRequestHash(job.input.image_url);

  // Cost firewall
  const { blocked, cachedOutputUrl: costCached } = await checkCostFirewall(
    job.id, "animate", reqHash,
  );
  if (blocked && costCached) {
    log(`cost_firewall HIT provider=kling — reusing cached animated_video_url`);
    return advanceFromAnimate(job, workerId, costCached, origin, log);
  }

  // Execution ledger
  const { shouldSkip, cachedOutputUrl: ledgerCached } = await startLedgerEntry(
    job.id, "animate", workerId, reqHash,
  );
  if (shouldSkip && ledgerCached) {
    log(`ledger HIT animate — reusing cached animated_video_url`);
    return advanceFromAnimate(job, workerId, ledgerCached, origin, log);
  }

  // ── Kling animate ──────────────────────────────────────────────────────────
  await registerCostIntent(job.id, "animate", "kling", reqHash, dagNode.creditEstimate);
  log(`[FAL_REQUEST] kling imageUrl=${job.input.image_url.substring(0, 80)} fal_key_set=${!!(process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY)}`);

  let animatedVideoUrl: string;
  try {
    const t0 = Date.now();
    animatedVideoUrl = await animateImage(job.input.image_url);
    log(`[FAL_RESPONSE] kling SUCCESS animatedUrl=${animatedVideoUrl.substring(0, 60)} elapsed=${Date.now() - t0}ms`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`kling ERROR: ${msg}`);
    await failLedgerEntry(job.id, "animate", workerId, msg);
    const { shouldRetry } = await recordStageFailure(
      job.id, workerId, "animate", msg, job.retry_count_per_stage ?? {},
    );
    if (shouldRetry) await retrigger(origin, job.id, log);
    return;
  }

  await markCostCharged(job.id, "animate", reqHash, animatedVideoUrl);
  await completeLedgerEntry(job.id, "animate", workerId, animatedVideoUrl);
  await advanceFromAnimate(job, workerId, animatedVideoUrl, origin, log);
}

async function advanceFromAnimate(
  job: AvatarJob,
  workerId: string,
  animatedVideoUrl: string,
  origin: string,
  log: (msg: string) => void,
): Promise<void> {
  const stageOutputs = {
    ...(job.stage_outputs ?? {}),
    animated_video_url: animatedVideoUrl,
  };
  const advanced = await advanceToNextStage(job.id, workerId, "lipsync", stageOutputs);
  if (!advanced) { log("lock_lost during transition — abandoning"); return; }
  log("advanced → lipsync");
  await retrigger(origin, job.id, log);
}

// ── Stage: Lipsync (SyncLabs) ──────────────────────────────────────────────

async function executeLipsyncStage(
  job: AvatarJob,
  workerId: string,
  origin: string,
  log: (msg: string) => void,
): Promise<void> {
  const audioUrl         = job.stage_outputs?.audio_url;
  const animatedVideoUrl = job.stage_outputs?.animated_video_url;

  if (!audioUrl || !animatedVideoUrl) {
    const msg = `stage_outputs incomplete — audio_url=${!!audioUrl} animated_video_url=${!!animatedVideoUrl}`;
    log(`ERROR: ${msg}`);
    await recordStageFailure(job.id, workerId, "lipsync", msg, job.retry_count_per_stage ?? {});
    return;
  }

  const dagNode = getDagNode("lipsync");
  const reqHash = lipsyncRequestHash(animatedVideoUrl, audioUrl);

  // Cost firewall
  const { blocked, cachedOutputUrl: costCached } = await checkCostFirewall(
    job.id, "lipsync", reqHash,
  );
  if (blocked && costCached) {
    log(`cost_firewall HIT provider=synclabs — reusing cached result_url`);
    await completeLedgerEntry(job.id, "lipsync", workerId, costCached);
    await completeJobWithLease(job.id, workerId, costCached, animatedVideoUrl);
    log("pipeline COMPLETE (cost_firewall cache)");
    return;
  }

  // Execution ledger
  const { shouldSkip, cachedOutputUrl: ledgerCached } = await startLedgerEntry(
    job.id, "lipsync", workerId, reqHash,
  );
  if (shouldSkip && ledgerCached) {
    log(`ledger HIT lipsync — reusing cached result_url`);
    await completeJobWithLease(job.id, workerId, ledgerCached, animatedVideoUrl);
    log("pipeline COMPLETE (ledger cache)");
    return;
  }

  // ── SyncLabs lipsync ───────────────────────────────────────────────────────
  await registerCostIntent(job.id, "lipsync", "synclabs", reqHash, dagNode.creditEstimate);
  log(`synclabs START animatedUrl=${animatedVideoUrl.substring(0, 60)}`);

  let resultUrl: string;
  try {
    const t0 = Date.now();
    resultUrl = await lipSyncVideo(animatedVideoUrl, audioUrl);
    log(`synclabs SUCCESS resultUrl=${resultUrl.substring(0, 60)} elapsed=${Date.now() - t0}ms`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const e = err as { name?: string; status?: number; body?: unknown; requestId?: string };
    log(`synclabs ERROR: ${msg}`);
    log(`synclabs ERROR_CLASS=${e.name ?? "unknown"}`);
    log(`synclabs ERROR_STATUS=${e.status ?? "none"}`);
    log(`synclabs ERROR_BODY=${JSON.stringify(e.body ?? null)}`);
    log(`synclabs ERROR_DETAIL=${JSON.stringify((e.body as { detail?: unknown } | null)?.detail ?? null)}`);
    log(`synclabs REQUEST_ID=${e.requestId ?? "none"}`);
    log(`synclabs ENDPOINT=fal-ai/sync-lipsync`);
    await failLedgerEntry(job.id, "lipsync", workerId, msg);
    const { shouldRetry } = await recordStageFailure(
      job.id, workerId, "lipsync", msg, job.retry_count_per_stage ?? {},
    );
    if (shouldRetry) await retrigger(origin, job.id, log);
    return;
  }

  // Commit cost → ledger → job completion (ordered)
  await markCostCharged(job.id, "lipsync", reqHash, resultUrl);
  await completeLedgerEntry(job.id, "lipsync", workerId, resultUrl);
  await completeJobWithLease(job.id, workerId, resultUrl, animatedVideoUrl);
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
