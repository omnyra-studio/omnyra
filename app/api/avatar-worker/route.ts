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
import { supabaseAdmin, cleanEnv } from "@/lib/supabase/admin";
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
  releaseLeaseAfterSubmit,
} from "@/lib/avatar-queue";
import {
  getDagNode,
  resolveStageFromLedger,
  ttsRequestHash,
  animateRequestHash,
  hedraRequestHash,
} from "@/lib/avatar-pipeline";
import { submitHedraJob, checkHedraGenerationStatus, makeHedraSafeImage } from "@/lib/providers/hedra";
import { generateKlingClip } from "@/lib/orchestrator/kling-worker";
import { KLING_I2V_PRO } from "@/lib/video-models";
import { toSignedUrlForProvider } from "@/lib/avatar/asset-validator";
import { planScenes, type SceneSpec, type CreatorContext } from "@/lib/avatar-scene-planner";
import { loadCharacter, buildCharacterPromptSuffix } from "@/lib/character-registry";
import { loadCreatorProfile } from "@/lib/creator-profile";
import { lookupCachedPrompt } from "@/lib/prompt-memory-cache";
import { getExecutionPlan } from "@/lib/execution-control";
import {
  assertNoLegacyLipsync,
  assertDirectorPipelineOnly,
  LegacyPipelineViolationError,
} from "@/lib/guards/legacy-pipeline-guard";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const maxDuration = 300;


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

// ── Script adaptation: third-person narration → first-person avatar dialogue ──

function adaptScriptForAvatar(rawScript: string): string {
  let script = rawScript
    .replace(/\b(?:She|He|They)\s+/gi, "I ")
    .replace(/\b(?:her|his|their)\b/gi, "my")
    .replace(/\b(?:she's|he's|they're)\b/gi, "I'm")
    .replace(/\b(?:She|He|They)'re\b/gi, "I'm");
  script = script.replace(/\. /g, ". ... ");
  script = script.replace(/\? /g, "? ... ");
  return script.trim();
}

// ── Hedra submit retry — exponential backoff, Kling fallback after exhaustion ──

async function submitHedraWithRetry(
  payload: Parameters<typeof submitHedraJob>[0],
  onSubmit: Parameters<typeof submitHedraJob>[1],
  log: (msg: string) => void,
): Promise<string> {
  try {
    return await submitHedraJob(payload, onSubmit);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[HEDRA_SUBMIT_FAILED] ${msg}`);
    throw err;
  }
}

async function klingAvatarFallback(params: {
  imageUrl:    string;
  prompt:      string;
  durationSecs: number;
}, log: (msg: string) => void): Promise<string> {
  log(`[KLING_AVATAR_FALLBACK] generating Kling i2v as Hedra substitute duration=${params.durationSecs}s`);
  const result = await generateKlingClip({
    shotId:        "avatar-fallback",
    shotNumber:    1,
    visualPrompt:  `Close-up talking head, direct camera address, natural expression, ${params.prompt.substring(0, 200)}`,
    modelId:       KLING_I2V_PRO,
    imageUrl:      params.imageUrl,
    durationSecs:  params.durationSecs > 10 ? 10 : 5,
    aspectRatio:   "9:16",
    speedMode:     "quality",
    motionStrength: 0.45,
  });
  log(`[KLING_AVATAR_FALLBACK] done url=${result.video_url.substring(0, 60)}`);
  return result.video_url;
}

// ── Library save helper ────────────────────────────────────────────────────────
// Called at every successful avatar completion path so the video always appears
// in My Videos even if the browser tab is closed before the client poll fires.
async function saveAvatarRender(
  userId:   string,
  videoUrl: string,
  script:   string | null | undefined,
  log:      (msg: string) => void,
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from("renders")
      .insert({
        user_id:      userId,
        status:       "complete",
        video_url:    videoUrl,
        script:       script ?? null,
        template:     "avatar",
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) {
      log(`[SAVE_RENDER:avatar] insert error code=${error.code} msg=${error.message}`);
    } else {
      log(`[SAVE_RENDER:avatar] saved to library user=${userId} url=${videoUrl.substring(0, 60)}`);
    }
  } catch (e) {
    log(`[SAVE_RENDER:avatar] unexpected error: ${(e as Error).message}`);
  }
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
  const secret = cleanEnv(process.env.CRON_SECRET);
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
  const BELLA = "EXAVITQu4vr4xnSDxMaO";
  const voiceId = job.input.voice_id ?? BELLA;
  const voiceSource = job.input.voice_id ? "job_input" : "default_bella";
  log(`[VOICE_ID_FINAL] voice_id=${voiceId} source=${voiceSource} job=${job.id}`);
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
  const planFloor = job.input.plan === "studio" ? 10 : job.input.plan === "creator" ? 5 : 3;
  const effectiveMaxScenes = Math.max(planFloor, execPlan.maxScenes);
  log(`[EXEC_CONTROL] mode=${execPlan.mode} maxScenes=${execPlan.maxScenes} planFloor=${planFloor} effective=${effectiveMaxScenes} reason=${execPlan.reason}`);

  // ── Hedra speed cap — hard-limit total audio before Director Core planning ──
  // Hedra generation time scales with audio length. Cap total words so the
  // combined audio stays under target seconds, regardless of input script length.
  // starter: 20 words ≈ 8s, creator: 28 words ≈ 11s, studio: 40 words ≈ 16s
  // All plans capped at 20s in lipsync stage (lightning: 12s) — word budgets are sized accordingly.
  // Lightning mode overrides to 28 words (~11s) regardless of plan.
  const HEDRA_WORD_BUDGET: Record<string, number> = { starter: 40, creator: 75, studio: 85 };
  const HEDRA_SCENE_CAP:   Record<string, number> = { starter: 1,  creator: 2,  studio: 3  };
  const hedraWordBudget = job.input.lightningMode ? 28 : (HEDRA_WORD_BUDGET[job.input.plan ?? "starter"] ?? 40);
  const hedraSceneCap   = job.input.lightningMode ? 1 : (HEDRA_SCENE_CAP[job.input.plan ?? "starter"] ?? 1);
  const hedraMaxScenes  = Math.min(effectiveMaxScenes, hedraSceneCap);

  // Strip stage directions BEFORE word-counting and Director Core planning.
  // Raw scripts often contain [SCENE:...], (action), *emphasis* — these are not
  // spoken words and Director Core would move them to visualPrompt, losing the
  // word budget (131 raw → 21 spoken in tests).
  const strippedScript = job.input.script.trim()
    .replace(/\[SCENE:[^\]]*\]/gi, ' ')   // [SCENE: beach at sunset]
    .replace(/\[[^\]]*\]/g, ' ')          // [any bracket direction]
    .replace(/\([^)]*\)/g, ' ')           // (sighs) (whispering)
    .replace(/\*[^*]*\*/g, ' ')           // *emphasis* or *action*
    .replace(/\s+/g, ' ')
    .trim();

  const rawScriptWords = strippedScript.split(/\s+/).filter(Boolean);
  const estAudioSec    = Math.round((Math.min(rawScriptWords.length, hedraWordBudget) / 2.5) * 10) / 10;
  let cappedScript     = strippedScript;
  if (rawScriptWords.length > hedraWordBudget) {
    cappedScript = rawScriptWords.slice(0, hedraWordBudget).join(" ").replace(/[,;.!?]+$/, "") + ".";
    log(`[AVATAR_CAP] words ${rawScriptWords.length}→${hedraWordBudget} est_audio_sec=${estAudioSec}s plan=${job.input.plan ?? "starter"} scenes_cap=${hedraMaxScenes}`);
  } else {
    log(`[AVATAR_CAP] no_cap words=${rawScriptWords.length} est_audio_sec=${estAudioSec}s budget=${hedraWordBudget}`);
  }
  cappedScript = adaptScriptForAvatar(cappedScript);
  log(`[AVATAR_ADAPT] script adapted to first-person dialogue chars=${cappedScript.length} words=${cappedScript.split(/\s+/).filter(Boolean).length}`);

  // ── Load creator + character memory (Director Core context) ───────────────
  const [creatorProfile, characterForCtx] = await Promise.all([
    loadCreatorProfile(job.user_id),
    job.input.character_id ? loadCharacter(job.input.character_id) : Promise.resolve(null),
  ]);
  const directorCtx: CreatorContext = { profile: creatorProfile, character: characterForCtx };
  log(`[DIRECTOR_CTX] profile=${!!creatorProfile} character=${!!characterForCtx} quality=${creatorProfile?.quality_score ?? "n/a"}`);

  // ── Director Core: plan N scenes from capped script ──────────────────────
  void setPipelineStatus(job.id, "planning_scenes");
  log(`[DIRECTOR] planning scenes script_chars=${cappedScript.length} max_scenes=${hedraMaxScenes}`);
  const directorT0 = Date.now();
  let scenes: SceneSpec[];
  try {
    const rawScenes = await planScenes(cappedScript, hedraMaxScenes, directorCtx);
    // For avatar jobs, ALL scenes must use Hedra (lip-sync bakes audio in).
    // Director Core motion-budget logic can downgrade "emotional" scenes to Kling
    // leaving hedraScenes=0 — force override here.
    scenes = rawScenes.map(s => ({ ...s, provider: 'hedra' as const }));
    log(`[AVATAR_PROVIDER_OVERRIDE] forced all ${scenes.length} scene(s) to provider=hedra`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[DIRECTOR] ERROR: ${msg} — aborting`);
    await failLedgerEntry(job.id, "tts", workerId, msg);
    const { shouldRetry } = await recordStageFailure(job.id, workerId, "tts", msg, job.retry_count_per_stage ?? {});
    if (shouldRetry) await retrigger(origin, job.id, log);
    return;
  }
  log(`[DIRECTOR] scenes=${scenes.length} elapsed=${Date.now() - directorT0}ms`);
  {
    const totalWords  = scenes.reduce((acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length, 0);
    const estimateSec = Math.round((totalWords / 2.5) * 10) / 10;
    const targetSec   = Math.round(scenes.reduce((acc, s) => acc + s.estimatedDurationS, 0) * 10) / 10;
    log(`[SCRIPT_AUDIT] plan=${job.input.plan ?? "starter"} scene_count=${scenes.length} total_words=${totalWords} estimated_sec=${estimateSec}`);
    log(`[SCRIPT_DURATION_TARGET] plan=${job.input.plan ?? "starter"} target_sec=${targetSec} scenes=${scenes.length} word_count=${totalWords}`);
  }

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
    const ttsResults = await Promise.all(
      scenes.map(async (scene) => {
        // Strip all stage directions before sending to TTS.
        // Anything inside [brackets], (parentheses), or *asterisks* is a director
        // note — not spoken words. ElevenLabs reads them literally if left in.
        const spokenText = scene.text
          .replace(/\[[\s\S]*?\]/g, "")   // [pause] [she breathes] [a tear rolls]
          .replace(/\([\s\S]*?\)/g, "")   // (sighs) (whispering)
          .replace(/\*[^*]*\*/g, "")  // *action* or *emphasis*
          .replace(/\s+/g, " ")
          .trim();

        if (!spokenText) {
          log(`[TTS_SEGMENT_SKIP] seg=${scene.index} — empty after stripping stage directions`);
          return null;
        }

        // Per-scene word cap — defense-in-depth: distributes the remaining budget
        // evenly across scenes so no single segment can blow the Hedra time target.
        const perSceneWordCap = Math.floor(hedraWordBudget / (scenes.length || 1));
        const spokenWords     = spokenText.split(/\s+/).filter(Boolean);
        let finalText         = spokenText;
        if (spokenWords.length > perSceneWordCap) {
          finalText = spokenWords.slice(0, perSceneWordCap).join(" ").replace(/[,;.!?]+$/, "") + ".";
          log(`[HEDRA_TRUNCATE] seg=${scene.index} words ${spokenWords.length}→${perSceneWordCap} (budget=${hedraWordBudget} / scenes=${scenes.length})`);
        }

        const estSegSec = Math.round((Math.min(spokenWords.length, perSceneWordCap) / 2.5) * 10) / 10;
        log(`[AVATAR_CAP] seg=${scene.index} words=${Math.min(spokenWords.length, perSceneWordCap)} est_audio_sec=${estSegSec}s`);
        log(`[TTS_SEGMENT_START] seg=${scene.index} chars=${finalText.length} words=${Math.min(spokenWords.length, perSceneWordCap)}`);
        const t1       = Date.now();
        const baseVS   = voiceSettingsForScene(scene.energy ?? 3, scene.pacing ?? "measured");
        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
          {
            method:  "POST",
            headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json" },
            body:    JSON.stringify({
              text:           finalText,
              model_id:       "eleven_flash_v2_5",
              voice_settings: { ...baseVS, speed: 1.10 },
            }),
          },
        );
        if (!res.ok) {
          const errText = await res.text().catch(() => `HTTP ${res.status}`);
          throw new Error(`ElevenLabs seg=${scene.index} ${res.status}: ${errText.substring(0, 200)}`);
        }
        const buffer = await res.arrayBuffer();
        log(`[TTS_SEGMENT_DONE] seg=${scene.index} bytes=${buffer.byteLength} elapsed=${Date.now() - t1}ms`);
        return { index: scene.index, text: finalText, buffer, char_count: finalText.length };
      }),
    );

    rawSegments = ttsResults.filter((r): r is NonNullable<typeof r> => r !== null);
    if (!rawSegments.length) {
      throw new Error("All TTS segments empty after stripping stage directions — script contains only non-spoken content");
    }
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
          modelVersion: "eleven_flash_v2_5",
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

  // All audio — even a single segment — goes through ffmpeg concat.
  // This gives us exact duration from ffmpeg stderr (time=HH:MM:SS.mm) and
  // eliminates the 128kbps byte-estimation hack.
  const allSegments: AudioSegment[] =
    audioSegments.length > 0
      ? audioSegments
      : [{ index: 0, text: "", audio_url: firstAudioUrl, char_count: 0 }];

  log(`[HEDRA_AUDIO] ffmpeg concat — ${allSegments.length} segment(s)`);
  const stitchT0   = Date.now();
  const tmpDir     = tmpdir();
  const sid        = job.id.replace(/-/g, "").substring(0, 8);
  const segPaths   = allSegments.map((_, i) => join(tmpDir, `ha-${sid}-s${i}.mp3`));
  const concatPath = join(tmpDir, `ha-${sid}-concat.txt`);
  const outPath    = join(tmpDir, `ha-${sid}-out.mp3`);
  const truncPath  = join(tmpDir, `ha-${sid}-trunc.mp3`);
  const cleanup    = [...segPaths, concatPath, outPath, truncPath];

  let combinedAudioUrl = "";
  let audioDurationSec: number | null = null;
  const audioSource = "ffmpeg_concat";

  try {
    const buffers = await Promise.all(
      allSegments.map(async (seg, i) => {
        const r = await fetch(seg.audio_url, { signal: AbortSignal.timeout(30_000) });
        if (!r.ok) throw new Error(`audio seg ${i} download ${r.status}`);
        return Buffer.from(await r.arrayBuffer());
      }),
    );

    for (let i = 0; i < buffers.length; i++) writeFileSync(segPaths[i], buffers[i]);

    const concatContent = allSegments.map((_, i) => `file '${segPaths[i].replace(/\\/g, "/")}'`).join("\n");
    writeFileSync(concatPath, concatContent);

    let lastFfmpegTime = "";
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatPath)
        .inputOptions(["-f", "concat", "-safe", "0"])
        .outputOptions(["-c", "copy"])
        .output(outPath)
        .on("stderr", (line: string) => {
          const m = line.match(/time=(\d+:\d+:\d+\.?\d*)/);
          if (m) lastFfmpegTime = m[1];
        })
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(new Error(`ffmpeg audio concat: ${err.message}`)))
        .run();
    });

    // Parse HH:MM:SS.mm into seconds
    if (lastFfmpegTime) {
      const parts = lastFfmpegTime.split(":").map(Number);
      audioDurationSec = Math.round((parts[0] * 3600 + parts[1] * 60 + parts[2]) * 10) / 10;
    }

    const stitchedBuffer = readFileSync(outPath);
    if (stitchedBuffer.byteLength === 0) throw new Error("ffmpeg audio concat produced 0-byte output");

    const hedraAudioCapSec = job.input.lightningMode ? 12 : 20;
    const overCap = audioDurationSec !== null && audioDurationSec > hedraAudioCapSec;
    log(`[HEDRA_AUDIO_DURATION] duration_sec=${audioDurationSec ?? "unknown"} cap_sec=${hedraAudioCapSec} over_cap=${overCap} source=ffmpeg_concat bytes=${stitchedBuffer.byteLength}`);

    let finalAudioBuffer = stitchedBuffer;
    if (overCap && audioDurationSec !== null) {
      try {
        await new Promise<void>((resolve, reject) => {
          ffmpeg()
            .input(outPath)
            .outputOptions(["-t", String(hedraAudioCapSec), "-c", "copy"])
            .output(truncPath)
            .on("end", () => resolve())
            .on("error", (err: Error) => reject(new Error(`ffmpeg truncate: ${err.message}`)))
            .run();
        });
        const truncBuf = readFileSync(truncPath);
        if (truncBuf.byteLength > 0) {
          finalAudioBuffer = truncBuf;
          audioDurationSec = hedraAudioCapSec;
          log(`[AUDIO_TRUNCATED] ${((stitchedBuffer.byteLength - truncBuf.byteLength) / 1024).toFixed(0)}KB trimmed → duration=${hedraAudioCapSec}s bytes=${truncBuf.byteLength}`);
        } else {
          log(`[AUDIO_TRUNCATE_WARN] ffmpeg produced 0 bytes — using original audio`);
        }
      } catch (truncErr) {
        log(`[AUDIO_TRUNCATE_ERROR] ${(truncErr as Error).message} — using original audio`);
      }
    }

    combinedAudioUrl = await uploadArtifact({
      jobId:        job.id,
      stage:        "tts_combined",
      buffer:       finalAudioBuffer,
      contentType:  "audio/mpeg",
      extension:    "mp3",
      modelVersion: "eleven_flash_v2_5",
    });
    log(`[HEDRA_AUDIO] concat done elapsed=${Date.now() - stitchT0}ms url=${combinedAudioUrl.substring(0, 80)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`audio concat ERROR: ${msg}`);
    await failLedgerEntry(job.id, "lipsync", workerId, msg);
    const { shouldRetry } = await recordStageFailure(job.id, workerId, "lipsync", msg, job.retry_count_per_stage ?? {});
    if (shouldRetry) await retrigger(origin, job.id, log);
    return;
  } finally {
    for (const p of cleanup) { try { unlinkSync(p); } catch { /* already gone */ } }
  }

  // ── Cost firewall / ledger ────────────────────────────────────────────────
  const dagNode = getDagNode("lipsync");
  const reqHash = hedraRequestHash(job.input.image_url, combinedAudioUrl);

  const { blocked, cachedOutputUrl: costCached } = await checkCostFirewall(job.id, "lipsync", reqHash);
  if (blocked && costCached) {
    log("cost_firewall HIT hedra — reusing cached");
    await completeLedgerEntry(job.id, "lipsync", workerId, costCached);
    await completeJobWithLease(job.id, workerId, costCached, costCached);
    void saveAvatarRender(job.user_id, costCached, job.input.script, log);
    log("pipeline COMPLETE (cost_firewall cache)");
    return;
  }

  const { shouldSkip, cachedOutputUrl: ledgerCached } = await startLedgerEntry(job.id, "lipsync", workerId, reqHash);
  if (shouldSkip && ledgerCached) {
    log("ledger HIT hedra — reusing cached");
    await completeJobWithLease(job.id, workerId, ledgerCached, ledgerCached);
    void saveAvatarRender(job.user_id, ledgerCached, job.input.script, log);
    log("pipeline COMPLETE (ledger cache)");
    return;
  }

  await registerCostIntent(job.id, "lipsync", "hedra", reqHash, dagNode.creditEstimate);

  // ── Hedra generation ──────────────────────────────────────────────────────
  void setPipelineStatus(job.id, "generating_avatar");
  log(`[PROVIDER_SELECTION] provider=hedra stage=lipsync`);
  const hedraT0 = Date.now();

  // Resolve avatar image with explicit priority:
  // 1. job.input.avatar_image_url — user uploaded their own face photo
  // 2. job.input.image_url        — user selected a specific scene/image
  // Never silently fall back to an unrelated image.
  let avatarImageRaw: string;
  let avatarImageSource: string;
  if (job.input.avatar_image_url) {
    avatarImageRaw = job.input.avatar_image_url;
    avatarImageSource = "uploaded";
  } else if (job.input.image_url) {
    avatarImageRaw = job.input.image_url;
    avatarImageSource = "selected";
  } else {
    const msg = "AVATAR_IMAGE_REQUIRED: no avatar_image_url or image_url in job input";
    log(`[AVATAR_SOURCE] ERROR: ${msg}`);
    await failLedgerEntry(job.id, "lipsync", workerId, msg);
    const { shouldRetry } = await recordStageFailure(job.id, workerId, "lipsync", msg, job.retry_count_per_stage ?? {});
    if (shouldRetry) await retrigger(origin, job.id, log);
    return;
  }
  log(`[AVATAR_SOURCE] source=${avatarImageSource} url=${avatarImageRaw.substring(0, 80)}`);

  // Sign both URLs immediately before the Hedra call.
  let signedImageUrl: string;
  let signedAudioUrl: string;
  try {
    [signedImageUrl, signedAudioUrl] = await Promise.all([
      toSignedUrlForProvider(avatarImageRaw),
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

  // Pre-process image through safety filter before every Hedra submission.
  // Reduces skin-detail moderation flags without visually degrading the image.
  let hedraImageUrl = signedImageUrl;
  try {
    hedraImageUrl = await makeHedraSafeImage(avatarImageRaw, job.id);
    log(`[HEDRA_SAFETY] image pre-processed for moderation safety url_len=${hedraImageUrl.length}`);
  } catch (safeErr) {
    log(`[HEDRA_SAFETY] pre-processing failed — using original: ${(safeErr as Error).message}`);
  }

  log(`[HEDRA_START] image_len=${hedraImageUrl.length} audio_len=${signedAudioUrl.length} avatar_source=${avatarImageSource}`);
  log(`[PIPELINE_ORDER] audio_source=${audioSource} segment_count=${allSegments.length} duration_sec=${audioDurationSec ?? "unknown"} audio_url=${combinedAudioUrl.substring(0, 80)}`);

  const hedraTextPrompt = `${(job.input.script ?? "Natural talking head").substring(0, 200)}. Natural speaking, subtle head movement, fully clothed.`;

  // ── Beach / outdoor early-switch to Kling ────────────────────────────────
  // These scene types contain exposed skin that reliably triggers Hedra moderation.
  // Skip Hedra entirely and go straight to Kling i2v.
  const beachKeywords = ["beach", "ocean", "bikini", "swimwear", "swimming", "swim ", "summer", "surf", "poolside"];
  const sceneHint = ((job.input.script ?? "") + " " + avatarImageRaw).toLowerCase();
  const isBeachScene = beachKeywords.some(kw => sceneHint.includes(kw));
  if (isBeachScene) {
    log(`[KLING_EARLY_SWITCH] beach/outdoor content detected — skipping Hedra, using Kling i2v directly`);
    try {
      const klingUrl = await klingAvatarFallback({
        imageUrl:     avatarImageRaw,
        prompt:       job.input.script ?? "",
        durationSecs: audioDurationSec ?? 10,
      }, log);
      await markCostCharged(job.id, "lipsync", reqHash, klingUrl);
      await completeLedgerEntry(job.id, "lipsync", workerId, klingUrl);
      await completeJobWithLease(job.id, workerId, klingUrl, klingUrl);
      void saveAvatarRender(job.user_id, klingUrl, job.input.script, log);
      log(`[KLING_EARLY_SWITCH] pipeline COMPLETE via Kling`);
      return;
    } catch (klingEarlyErr) {
      log(`[KLING_EARLY_SWITCH] Kling also failed: ${(klingEarlyErr as Error).message} — continuing to Hedra`);
    }
  }

  // ── Resolve or submit generation ID ──────────────────────────────────────
  const existingGenId = (job.stage_outputs as Record<string, string> | undefined)
    ?.hedra_generation_id;
  let hedraGenId: string;

  if (existingGenId) {
    log(`[HEDRA_ALREADY_SUBMITTED] generation_id=${existingGenId} — resuming inline poll`);
    hedraGenId = existingGenId;
  } else {
    try {
      hedraGenId = await submitHedraWithRetry(
        {
          image_url:    hedraImageUrl,
          audio_url:    signedAudioUrl,
          resolution:   "720p",
          aspect_ratio: "9:16",
          duration_s:   audioDurationSec ?? undefined,
          text_prompt:  hedraTextPrompt,
          _jobId:       job.id,
        },
        async (genId: string) => {
          await supabaseAdmin
            .from("avatar_jobs")
            .update({
              stage_outputs: {
                ...(job.stage_outputs ?? {}),
                hedra_generation_id: genId,
                hedra_req_hash:      reqHash,
                hedra_submitted_at:  new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);
          log(`[HEDRA_SUBMITTED] generation_id=${genId}`);
        },
        log,
      );
      log(`[HEDRA_SUBMITTED] generation_id=${hedraGenId} — starting inline poll (90s timeout)`);
    } catch (err) {
      const e    = err instanceof Error ? err : new Error(String(err));
      const node = e as NodeJS.ErrnoException & { cause?: { code?: string; message?: string } };
      log(`[HEDRA_SUBMIT_FAILED] ${e.message}`);
      log(`[HEDRA_DEBUG] name=${e.name} code=${node.code ?? "none"} cause_code=${node.cause?.code ?? "none"} cause_msg=${node.cause?.message ?? "none"}`);

      // Emergency Kling fallback — Hedra submit failed after all retries (including moderation)
      try {
        const klingUrl = await klingAvatarFallback({
          imageUrl:    signedImageUrl,
          prompt:      job.input.script ?? "",
          durationSecs: audioDurationSec ?? 10,
        }, log);
        await markCostCharged(job.id, "lipsync", reqHash, klingUrl);
        await completeLedgerEntry(job.id, "lipsync", workerId, klingUrl);
        await completeJobWithLease(job.id, workerId, klingUrl, klingUrl);
        void saveAvatarRender(job.user_id, klingUrl, job.input.script, log);
        log(`[KLING_AVATAR_FALLBACK] pipeline COMPLETE via Kling`);
        return;
      } catch (klingErr) {
        log(`[KLING_AVATAR_FALLBACK] also failed: ${(klingErr as Error).message}`);
      }

      await failLedgerEntry(job.id, "lipsync", workerId, e.message);
      const { shouldRetry } = await recordStageFailure(job.id, workerId, "lipsync", e.message, job.retry_count_per_stage ?? {});
      if (shouldRetry) await retrigger(origin, job.id, log);
      return;
    }
  }

  // ── Inline poll for 90s, then fall back to cron ──────────────────────────
  void setPipelineStatus(job.id, "generating_avatar");
  const pollMs    = 2_000;
  const maxPollMs = 90_000;
  const pollStart = Date.now();
  let hedraVideoUrl: string | null = null;

  while (Date.now() - pollStart < maxPollMs) {
    await new Promise(r => setTimeout(r, pollMs));
    const elapsedS = Math.round((Date.now() - pollStart) / 1000);
    let pollResult: Awaited<ReturnType<typeof checkHedraGenerationStatus>>;
    try {
      pollResult = await checkHedraGenerationStatus(hedraGenId);
    } catch (e) {
      log(`[HEDRA_POLL_ERROR] elapsed=${elapsedS}s check_threw: ${(e as Error).message}`);
      break;
    }
    if (pollResult.status === "complete" && pollResult.videoUrl) {
      hedraVideoUrl = pollResult.videoUrl;
      log(`[HEDRA_POLL_SUCCESS] elapsed=${elapsedS}s videoUrl=${pollResult.videoUrl.substring(0, 60)}`);
      break;
    }
    if (pollResult.status === "error") {
      log(`[HEDRA_POLL_ERROR] elapsed=${elapsedS}s msg=${pollResult.errorMessage ?? "unknown"}`);
      break;
    }
    if (elapsedS % 10 === 0 || elapsedS <= 4) {
      log(`[HEDRA_POLL] elapsed=${elapsedS}s status=${pollResult.status ?? "pending"} id=${hedraGenId.substring(0, 12)}`);
    }
  }

  if (hedraVideoUrl) {
    await markCostCharged(job.id, "lipsync", reqHash, hedraVideoUrl);
    await completeLedgerEntry(job.id, "lipsync", workerId, hedraVideoUrl);
    await completeJobWithLease(job.id, workerId, hedraVideoUrl, hedraVideoUrl);
    void saveAvatarRender(job.user_id, hedraVideoUrl, job.input.script, log);
    const audioDurStr = audioDurationSec != null ? audioDurationSec.toFixed(1) : "unknown";
    log(`[AVATAR_DURATION] voice=${audioDurStr}s final=${audioDurStr}s elapsed=${Math.round((Date.now() - hedraT0) / 1000)}s`);
    log(`[HEDRA_COMPLETE] pipeline COMPLETE inline elapsed_total=${Math.round((Date.now() - stageT0) / 1000)}s`);
  } else {
    // Cron fallback: release lease so the minute-cron can finish the job
    await releaseLeaseAfterSubmit(job.id, workerId);
    void setPipelineStatus(job.id, "awaiting_hedra");
    log(`[HEDRA_CRON_FALLBACK] poll exhausted after ${Math.round((Date.now() - pollStart) / 1000)}s — lease released, cron will complete`);
  }
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
        "x-worker-secret": cleanEnv(process.env.CRON_SECRET) ?? "",
      },
      body: JSON.stringify({ jobId }),
    });
    const body = await res.text().catch(() => "");
    log(`[RETRIGGER_RESPONSE] status=${res.status} ok=${res.ok} body=${body.substring(0, 200)}`);
  } catch (e) {
    log(`[RETRIGGER_RESPONSE] fetch_threw: ${(e as Error)?.message}`);
  }
}
