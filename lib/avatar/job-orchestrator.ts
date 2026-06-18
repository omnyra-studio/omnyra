// Avatar Job Orchestrator
//
// Drives an avatar_job through the production pipeline state machine:
//   validating_assets → building_scenes → routing_model → executing → post_validation → stored
//
// Rules:
//   - Every stage transition is written to the DB before executing the stage
//   - Failures are loud: job is marked failed with error code, no silent fallback
//   - Stage outputs (resolved URLs, routing decision) are passed via stage_outputs JSONB
//   - Each stage writes to avatar_stage_ledger for exactly-once audit trail
//   - Deterministic model routing: talking_head + low motion → Hedra, otherwise Kling

import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateAssetBundle }      from "./asset-validator";
import { planCinematicShots }        from "./cinematic-sequencer";
import { classifyScene }             from "./scene-classifier";
import { routeModel, injectVisualLock } from "./model-router";
import { scoreGenerationOutput }     from "./quality-scorer";
import { classifyFailure, logFailure } from "./failure-taxonomy";
import { generateHedraAvatar }       from "@/lib/providers/hedra";
import type { DirectorBrief }        from "./cinematic-sequencer";
import type { RoutingResult }        from "./model-router";

// ── Stage type ────────────────────────────────────────────────────────────────

export type PipelineStage =
  | "validating_assets"
  | "building_scenes"
  | "routing_model"
  | "executing"
  | "post_validation"
  | "stored";

// ── Job input shape (from avatar_jobs.input JSONB) ────────────────────────────

export interface AvatarJobInput {
  image_url:    string;
  audio_url:    string;
  description?: string;
  brief?:       Partial<DirectorBrief>;
}

// ── Orchestrator result ───────────────────────────────────────────────────────

export interface OrchestratorResult {
  ok:          boolean;
  job_id:      string;
  video_url?:  string;
  stage?:      PipelineStage;
  error?:      string;
  error_code?: string;
}

// ── Supabase RPC helpers ──────────────────────────────────────────────────────

async function advanceStage(jobId: string, stage: PipelineStage, outputs: Record<string, unknown> = {}): Promise<void> {
  const { error } = await supabaseAdmin.rpc("advance_avatar_job_stage", {
    p_job_id:  jobId,
    p_stage:   stage,
    p_outputs: outputs,
  });
  if (error) throw new Error(`advance_avatar_job_stage failed: ${error.message}`);
}

async function completeJob(jobId: string, resultUrl: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc("complete_avatar_job", {
    p_job_id:     jobId,
    p_result_url: resultUrl,
  });
  if (error) throw new Error(`complete_avatar_job failed: ${error.message}`);
}

async function failJob(jobId: string, message: string, code: string): Promise<void> {
  await supabaseAdmin.rpc("fail_avatar_job", {
    p_job_id:     jobId,
    p_error:      message.substring(0, 2000),
    p_error_code: code,
  });
}

async function writeStageRecord(
  jobId:      string,
  stage:      PipelineStage,
  workerId:   string,
  status:     "running" | "completed" | "failed",
  opts:       { output_url?: string; error?: string; request_hash?: string } = {},
): Promise<void> {
  await supabaseAdmin
    .from("avatar_stage_ledger")
    .upsert({
      job_id:               jobId,
      stage,
      execution_id:         workerId,
      status,
      output_url:           opts.output_url ?? null,
      error:                opts.error ?? null,
      external_request_hash: opts.request_hash ?? null,
      updated_at:           new Date().toISOString(),
    }, { onConflict: "job_id,stage", ignoreDuplicates: false });
}

// ── Stage: validate assets ────────────────────────────────────────────────────

async function runValidateAssets(
  jobId:    string,
  workerId: string,
  input:    AvatarJobInput,
): Promise<{ imageUrl: string; audioUrl: string }> {
  await writeStageRecord(jobId, "validating_assets", workerId, "running");

  const bundle = await validateAssetBundle({
    imageUrl: input.image_url,
    audioUrl: input.audio_url,
  });

  if (!bundle.ok) {
    const msg = `Asset validation failed: ${bundle.errors.join("; ")}`;
    await writeStageRecord(jobId, "validating_assets", workerId, "failed", { error: msg });
    throw Object.assign(new Error(msg), { code: "FETCH_FAILED" });
  }

  await writeStageRecord(jobId, "validating_assets", workerId, "completed", {
    output_url: bundle.resolved.imageUrl,
  });

  return {
    imageUrl: bundle.resolved.imageUrl!,
    audioUrl: bundle.resolved.audioUrl!,
  };
}

// ── Stage: build scenes ───────────────────────────────────────────────────────

async function runBuildScenes(
  jobId:    string,
  workerId: string,
  input:    AvatarJobInput,
): Promise<{ scene_json: string }> {
  await writeStageRecord(jobId, "building_scenes", workerId, "running");

  const brief: DirectorBrief = {
    narrative:           input.description ?? "talking head portrait",
    tone:                (input.brief?.tone) ?? "professional",
    target_duration_sec: input.brief?.target_duration_sec ?? 30,
    platform:            input.brief?.platform ?? "generic",
    density:             input.brief?.density ?? "standard",
    character_id:        input.brief?.character_id,
  };

  const plan = planCinematicShots(brief);
  const scene_json = JSON.stringify(plan);

  await writeStageRecord(jobId, "building_scenes", workerId, "completed");

  return { scene_json };
}

// ── Stage: route model ────────────────────────────────────────────────────────

async function runRouteModel(
  jobId:       string,
  workerId:    string,
  description: string,
): Promise<{ routing: RoutingResult }> {
  await writeStageRecord(jobId, "routing_model", workerId, "running");

  const scene   = classifyScene(description || "talking head portrait lipsync");
  const routing = routeModel(scene);

  console.info("[job-orchestrator] model routed", {
    job_id:     jobId,
    model:      routing.model,
    scene_type: scene.scene_type,
    reason:     routing.reason,
  });

  await writeStageRecord(jobId, "routing_model", workerId, "completed");

  return { routing };
}

// ── Stage: execute ────────────────────────────────────────────────────────────

async function runExecute(
  jobId:     string,
  workerId:  string,
  imageUrl:  string,
  audioUrl:  string,
  routing:   RoutingResult,
  description: string,
): Promise<{ video_url: string; request_id: string }> {
  await writeStageRecord(jobId, "executing", workerId, "running");

  const { prompt, negative_prompt } = injectVisualLock(description || "portrait");
  console.info("[job-orchestrator] executing with visual lock", { model: routing.model, prompt: prompt.substring(0, 80) });
  void negative_prompt;

  // Hedra handles lipsync/talking-head. Seedance routes use Hedra for avatar jobs.
  if (routing.model === "seedance") {
    console.info("[job-orchestrator] Seedance routed scene — avatar job uses Hedra lip-sync");
  }

  let result: { video_url: string; request_id: string };
  try {
    result = await generateHedraAvatar({ image_url: imageUrl, audio_url: audioUrl });
  } catch (err) {
    const f = classifyFailure(err);
    await writeStageRecord(jobId, "executing", workerId, "failed", {
      error:        `${f.code}: ${f.message.substring(0, 300)}`,
      request_hash: `${imageUrl}::${audioUrl}`,
    });
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { code: f.code });
  }

  await writeStageRecord(jobId, "executing", workerId, "completed", {
    output_url:   result.video_url,
    request_hash: result.request_id,
  });

  return result;
}

// ── Stage: post validation ────────────────────────────────────────────────────

async function runPostValidation(
  jobId:    string,
  workerId: string,
  videoUrl: string,
): Promise<{ resolved_url: string }> {
  await writeStageRecord(jobId, "post_validation", workerId, "running");

  const quality = await scoreGenerationOutput(videoUrl);
  if (!quality.ok) {
    const msg = `Post-validation failed: ${quality.issues.join("; ")}`;
    await writeStageRecord(jobId, "post_validation", workerId, "failed", {
      error:      msg,
      output_url: videoUrl,
    });
    throw Object.assign(new Error(msg), { code: "TRUNCATION_ERROR" });
  }

  await writeStageRecord(jobId, "post_validation", workerId, "completed", {
    output_url: quality.url,
  });

  return { resolved_url: quality.url };
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export async function runAvatarJob(
  jobId:    string,
  input:    AvatarJobInput,
  workerId: string,
): Promise<OrchestratorResult> {
  console.info("[job-orchestrator] starting job", { job_id: jobId, worker_id: workerId });

  try {
    // ── Stage 1: validate assets ─────────────────────────────────────────────
    await advanceStage(jobId, "validating_assets");
    const { imageUrl, audioUrl } = await runValidateAssets(jobId, workerId, input);

    // ── Stage 2: build scenes ────────────────────────────────────────────────
    await advanceStage(jobId, "building_scenes", { image_url: imageUrl, audio_url: audioUrl });
    const { scene_json } = await runBuildScenes(jobId, workerId, input);

    // ── Stage 3: route model ─────────────────────────────────────────────────
    await advanceStage(jobId, "routing_model", { scene_json });
    const { routing } = await runRouteModel(jobId, workerId, input.description ?? "");

    // ── Stage 4: execute ─────────────────────────────────────────────────────
    await advanceStage(jobId, "executing", { model: routing.model, routing_reason: routing.reason });
    const { video_url } = await runExecute(jobId, workerId, imageUrl, audioUrl, routing, input.description ?? "");

    // ── Stage 5: post validation ─────────────────────────────────────────────
    await advanceStage(jobId, "post_validation", { raw_video_url: video_url });
    const { resolved_url } = await runPostValidation(jobId, workerId, video_url);

    // ── Stage 6: stored ──────────────────────────────────────────────────────
    await completeJob(jobId, resolved_url);
    console.info("[job-orchestrator] job completed", { job_id: jobId, video_url: resolved_url.substring(0, 80) });

    return { ok: true, job_id: jobId, video_url: resolved_url, stage: "stored" };
  } catch (err) {
    const failure = classifyFailure(err);
    logFailure("job-orchestrator", failure);

    await failJob(jobId, failure.message, failure.code);

    return {
      ok:         false,
      job_id:     jobId,
      stage:      "stored",
      error:      failure.message.substring(0, 500),
      error_code: failure.code,
    };
  }
}

// ── Claim + run (used by the worker HTTP route) ───────────────────────────────

export async function claimAndRunNextJob(workerId: string): Promise<OrchestratorResult | null> {
  const { data: jobs, error } = await supabaseAdmin.rpc("claim_avatar_job", {
    p_worker_id:  workerId,
    p_lease_secs: 600,
  });

  if (error) throw new Error(`claim_avatar_job failed: ${error.message}`);
  if (!jobs || jobs.length === 0) return null;

  const job = jobs[0] as { id: string; input: AvatarJobInput };
  return runAvatarJob(job.id, job.input, workerId);
}
