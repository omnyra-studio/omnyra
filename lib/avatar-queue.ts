import { createHash } from "crypto";
import { supabaseAdmin } from "./supabase/admin";

// ── Types ──────────────────────────────────────────────────────────────────────

export type JobStatus = "queued" | "processing" | "completed" | "failed";
export type PipelineStage = "tts" | "animate" | "lipsync";

export const STAGE_SEQUENCE: readonly PipelineStage[] = ["tts", "animate", "lipsync"];

// Per-stage retry caps — more retries for cheap/fast stages, fewer for expensive ones
export const STAGE_MAX_RETRIES: Record<PipelineStage, number> = {
  tts:     3,
  animate: 2,
  lipsync: 2,
};

// Single lease duration covers the longest possible stage (Kling ~8 min) plus headroom
const STAGE_LEASE_MS = 12 * 60 * 1000; // 12 minutes

export interface AvatarJobInput {
  script:    string;
  voice_id:  string | null;
  image_url: string;
  plan?:     "starter" | "studio";
}

export interface AvatarJob {
  id: string;
  user_id: string;
  idempotency_key: string;
  status: JobStatus;
  input: AvatarJobInput;
  result_url: string | null;
  animated_video_url: string | null;
  error: string | null;
  stage: string | null;
  retry_count: number;
  max_retries: number;
  // ── Lease fields ────────────────────────────────────────────────────────────
  locked_by: string | null;
  locked_at: string | null;
  lease_expires_at: string | null;
  // ── Stage tracking ──────────────────────────────────────────────────────────
  stage_outputs: Record<string, string>;
  retry_count_per_stage: Record<string, number>;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function idempotencyKey(userId: string, input: AvatarJobInput): string {
  return createHash("md5")
    .update(`${userId}:${input.script}:${input.voice_id ?? ""}:${input.image_url}`)
    .digest("hex");
}

// ── Job creation ───────────────────────────────────────────────────────────────

/**
 * Returns an existing non-failed active job (idempotency), or inserts a new one.
 * New jobs start at stage='tts'.
 */
export async function createOrFindJob(
  userId: string,
  input: AvatarJobInput,
): Promise<AvatarJob> {
  const key = idempotencyKey(userId, input);

  const { data: existing } = await supabaseAdmin
    .from("avatar_jobs")
    .select("*")
    .eq("user_id", userId)
    .eq("idempotency_key", key)
    .not("status", "eq", "failed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing as AvatarJob;

  const { data, error } = await supabaseAdmin
    .from("avatar_jobs")
    .insert({
      user_id:              userId,
      idempotency_key:      key,
      status:               "queued",
      stage:                "tts",
      input,
      retry_count:          0,
      max_retries:          2,
      stage_outputs:        {},
      retry_count_per_stage: {},
    })
    .select()
    .single();

  if (error || !data) throw new Error(`avatar_jobs insert: ${error?.message ?? "no row"}`);
  return data as AvatarJob;
}

// ── Atomic lease operations ────────────────────────────────────────────────────

/**
 * Atomically claim a queued job for a worker.
 *
 * Claim succeeds only when:
 *   - status = 'queued'
 *   - locked_by IS NULL  (not held by another worker)
 *
 * Returns null if the job was already claimed — caller must skip execution.
 */
export async function claimStage(
  jobId: string,
  workerId: string,
): Promise<AvatarJob | null> {
  const leaseExpiry = new Date(Date.now() + STAGE_LEASE_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("avatar_jobs")
    .update({
      status:           "processing",
      locked_by:        workerId,
      locked_at:        new Date().toISOString(),
      lease_expires_at: leaseExpiry,
      updated_at:       new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "queued")
    .is("locked_by", null)
    .select()
    .single();

  if (error || !data) return null;
  return data as AvatarJob;
}

/**
 * Persist stage output and transition the job to the next stage.
 *
 * Releases the lock (locked_by → null) and sets status back to 'queued'
 * so the next stage can be claimed independently.
 *
 * Returns false if the current worker no longer holds the lock (concurrent
 * takeover by recovery cron) — caller must abandon execution.
 */
export async function advanceToNextStage(
  jobId: string,
  workerId: string,
  nextStage: PipelineStage,
  stageOutputs: Record<string, string>,
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("avatar_jobs")
    .update({
      status:           "queued",
      stage:            nextStage,
      locked_by:        null,
      locked_at:        null,
      lease_expires_at: null,
      stage_outputs:    stageOutputs,
      updated_at:       new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("locked_by", workerId)
    .select("id")
    .single();

  return !!data;
}

/**
 * Complete the final lipsync stage and mark the job done.
 * Verifies lock ownership before writing — abandoned if lock was stolen.
 */
export async function completeJobWithLease(
  jobId: string,
  workerId: string,
  resultUrl: string,
  animatedVideoUrl: string,
): Promise<void> {
  await supabaseAdmin
    .from("avatar_jobs")
    .update({
      status:             "completed",
      result_url:         resultUrl,
      animated_video_url: animatedVideoUrl,
      stage:              "done",
      error:              null,
      locked_by:          null,
      locked_at:          null,
      lease_expires_at:   null,
      updated_at:         new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("locked_by", workerId);
}

/**
 * Record a stage failure.
 *
 * Increments per-stage retry count.  If retries remain, resets to 'queued'
 * so the next trigger reclaims and re-executes that stage.  Otherwise fails
 * the job permanently.
 *
 * Releases the lock regardless of outcome.
 */
export async function recordStageFailure(
  jobId: string,
  workerId: string,
  stage: PipelineStage,
  errorMessage: string,
  currentPerStage: Record<string, number>,
): Promise<{ shouldRetry: boolean }> {
  const stageCount   = (currentPerStage[stage] ?? 0) + 1;
  const shouldRetry  = stageCount < STAGE_MAX_RETRIES[stage];
  const updatedPerStage = { ...currentPerStage, [stage]: stageCount };

  await supabaseAdmin
    .from("avatar_jobs")
    .update({
      status:               shouldRetry ? "queued" : "failed",
      error:                errorMessage,
      last_error_code:      stage,
      locked_by:            null,
      locked_at:            null,
      lease_expires_at:     null,
      retry_count_per_stage: updatedPerStage,
      retry_count:          Object.values(updatedPerStage).reduce((a, b) => a + b, 0),
      updated_at:           new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("locked_by", workerId);

  return { shouldRetry };
}

// ── Recovery queries ───────────────────────────────────────────────────────────

/**
 * Find jobs with expired leases — worker crashed or function was killed.
 * Uses lease_expires_at, not a time heuristic.
 */
export async function findExpiredLeaseJobs(): Promise<AvatarJob[]> {
  const { data } = await supabaseAdmin
    .from("avatar_jobs")
    .select("*")
    .eq("status", "processing")
    .lt("lease_expires_at", new Date().toISOString())
    .limit(20);
  return (data ?? []) as AvatarJob[];
}

/**
 * Find jobs stuck in 'queued' with a non-null stage — the inter-stage trigger
 * was lost (network failure, cold start drop).  Excludes newly-created jobs
 * (stage='tts', updated_at recent) to avoid false positives.
 */
export async function findOrphanedQueuedJobs(
  olderThanMs: number = 10 * 60 * 1000,
): Promise<AvatarJob[]> {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const { data } = await supabaseAdmin
    .from("avatar_jobs")
    .select("*")
    .eq("status", "queued")
    .not("stage", "is", null)
    .lt("updated_at", cutoff)
    .limit(20);
  return (data ?? []) as AvatarJob[];
}

/**
 * Atomically reclaim a job whose lease has expired.
 * Only succeeds when lease_expires_at < now() — safe to call concurrently
 * from multiple recovery instances; exactly one will win.
 */
export async function reclaimExpiredLease(jobId: string): Promise<AvatarJob | null> {
  const { data } = await supabaseAdmin
    .from("avatar_jobs")
    .update({
      status:           "queued",
      locked_by:        null,
      locked_at:        null,
      lease_expires_at: null,
      updated_at:       new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "processing")
    .lt("lease_expires_at", new Date().toISOString())
    .select()
    .single();

  return data ? (data as AvatarJob) : null;
}

/**
 * Permanently fail a job — called when a reclaimed job has no retries left.
 */
export async function permanentlyFailJob(
  jobId: string,
  error: string,
): Promise<void> {
  await supabaseAdmin
    .from("avatar_jobs")
    .update({
      status:           "failed",
      error,
      locked_by:        null,
      locked_at:        null,
      lease_expires_at: null,
      updated_at:       new Date().toISOString(),
    })
    .eq("id", jobId);
}

// ── Execution Ledger ───────────────────────────────────────────────────────────
//
// avatar_stage_ledger PRIMARY KEY (job_id, stage) enforces exactly-once
// execution per stage per job.  A completed row is never overwritten —
// it acts as a permanent cost-protection cache.

export interface LedgerEntry {
  job_id: string;
  stage: string;
  execution_id: string;
  status: "running" | "completed" | "failed";
  external_request_hash: string | null;
  output_url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Check the ledger and claim execution authority for a stage.
 *
 * Returns { shouldSkip: true, cachedOutputUrl } when the stage already
 * completed in a previous invocation — caller must use cachedOutputUrl
 * instead of calling the external API again.
 *
 * Returns { shouldSkip: false } when the caller owns execution authority
 * and must proceed with the external API call.
 *
 * The lease guarantees single-worker access, so the read-then-write
 * pattern here is free of concurrency races under normal operation.
 */
export async function startLedgerEntry(
  jobId: string,
  stage: string,
  executionId: string,
  requestHash: string | null = null,
): Promise<{ shouldSkip: boolean; cachedOutputUrl: string | null }> {
  const { data: existing } = await supabaseAdmin
    .from("avatar_stage_ledger")
    .select("status, output_url")
    .eq("job_id", jobId)
    .eq("stage", stage)
    .maybeSingle();

  // Stage already completed — caller must not re-execute the external API
  if (existing?.status === "completed" && existing.output_url) {
    return { shouldSkip: true, cachedOutputUrl: existing.output_url };
  }

  if (existing) {
    // 'running' (stale crash) or 'failed' — update with our executionId
    // Safety: WHERE neq('completed') ensures we never overwrite a completed entry
    await supabaseAdmin
      .from("avatar_stage_ledger")
      .update({
        execution_id:          executionId,
        status:                "running",
        error:                 null,
        output_url:            null,
        external_request_hash: requestHash,
        updated_at:            new Date().toISOString(),
      })
      .eq("job_id", jobId)
      .eq("stage", stage)
      .neq("status", "completed");
  } else {
    // First execution of this stage
    await supabaseAdmin
      .from("avatar_stage_ledger")
      .insert({
        job_id:                jobId,
        stage,
        execution_id:          executionId,
        status:                "running",
        external_request_hash: requestHash,
      });
  }

  return { shouldSkip: false, cachedOutputUrl: null };
}

/**
 * Mark a stage as completed and persist its output URL.
 * Only succeeds if execution_id still matches — prevents stale workers
 * from overwriting results after a lease was stolen by recovery.
 */
export async function completeLedgerEntry(
  jobId: string,
  stage: string,
  executionId: string,
  outputUrl: string,
): Promise<void> {
  await supabaseAdmin
    .from("avatar_stage_ledger")
    .update({
      status:     "completed",
      output_url: outputUrl,
      error:      null,
      updated_at: new Date().toISOString(),
    })
    .eq("job_id", jobId)
    .eq("stage", stage)
    .eq("execution_id", executionId);
}

/**
 * Mark a stage as failed in the ledger.
 * Allows the next retry to see the failure history.
 */
export async function failLedgerEntry(
  jobId: string,
  stage: string,
  executionId: string,
  error: string,
): Promise<void> {
  await supabaseAdmin
    .from("avatar_stage_ledger")
    .update({
      status:     "failed",
      error,
      updated_at: new Date().toISOString(),
    })
    .eq("job_id", jobId)
    .eq("stage", stage)
    .eq("execution_id", executionId);
}

/**
 * Delete non-completed ledger entries for a stage.
 * Called by recovery after reclaiming an expired lease — clears stale
 * 'running' entries so the new worker can insert a fresh one.
 * Never deletes 'completed' entries (cost-protection cache is permanent).
 */
export async function resetLedgerForStage(
  jobId: string,
  stage: string,
): Promise<void> {
  await supabaseAdmin
    .from("avatar_stage_ledger")
    .delete()
    .eq("job_id", jobId)
    .eq("stage", stage)
    .neq("status", "completed");
}

/**
 * Repair a job's stage field when it desyncs from ledger truth.
 * Only updates when job is unlocked (locked_by IS NULL) to avoid interfering
 * with an active worker.
 */
export async function repairJobStage(
  jobId: string,
  correctStage: PipelineStage,
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("avatar_jobs")
    .update({ stage: correctStage, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "queued")
    .is("locked_by", null)
    .select("id")
    .single();
  return !!data;
}

/**
 * Read the set of stages confirmed completed in the ledger for a job.
 * Used by the DAG resolver to determine what stage is safe to execute next.
 */
export async function getCompletedStages(jobId: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from("avatar_stage_ledger")
    .select("stage")
    .eq("job_id", jobId)
    .eq("status", "completed");
  return new Set((data ?? []).map((r: { stage: string }) => r.stage));
}

// ── Cost Firewall ──────────────────────────────────────────────────────────────
//
// external_api_cost_ledger PRIMARY KEY (job_id, stage, request_hash) enforces
// zero-duplicate billing.  A 'charged' entry with output_url is the absolute
// authority: the exact API call happened and was paid for — DO NOT repeat it.
//
// Layer ordering in worker:
//   1. Cost firewall check (blocks duplicate billing by request_hash)
//   2. Stage ledger check  (blocks duplicate execution by stage)
//   3. API call            (only reached when both pass)
//   4. Cost commit         (records charge + output)
//   5. Ledger commit       (records stage completion)

/**
 * Check whether this exact API call (identified by request_hash) has already
 * been charged.  If 'charged' with an output_url, caller MUST reuse that
 * output and MUST NOT call the external API again.
 */
export async function checkCostFirewall(
  jobId: string,
  stage: string,
  requestHash: string,
): Promise<{ blocked: boolean; cachedOutputUrl: string | null }> {
  const { data } = await supabaseAdmin
    .from("external_api_cost_ledger")
    .select("status, output_url")
    .eq("job_id", jobId)
    .eq("stage", stage)
    .eq("request_hash", requestHash)
    .maybeSingle();

  if (data?.status === "charged" && data.output_url) {
    return { blocked: true, cachedOutputUrl: data.output_url };
  }
  return { blocked: false, cachedOutputUrl: null };
}

/**
 * Register cost intent immediately before the API call.
 * Uses ignoreDuplicates so a previous 'pending' from a crashed attempt
 * doesn't block registration — we'll overwrite to 'charged' on success.
 */
export async function registerCostIntent(
  jobId: string,
  stage: string,
  provider: string,
  requestHash: string,
  creditEstimate: number,
): Promise<void> {
  await supabaseAdmin
    .from("external_api_cost_ledger")
    .upsert(
      {
        job_id:          jobId,
        stage,
        provider,
        request_hash:    requestHash,
        status:          "pending",
        cost_estimate:   creditEstimate,
        updated_at:      new Date().toISOString(),
      },
      { onConflict: "job_id,stage,request_hash", ignoreDuplicates: true },
    );
}

/**
 * Commit a successful API charge.  Idempotent — safe to call even if the
 * row was already marked 'charged' (concurrent recovery scenario).
 * Never downgrades a 'charged' entry back to 'pending'.
 */
export async function markCostCharged(
  jobId: string,
  stage: string,
  requestHash: string,
  outputUrl: string,
): Promise<void> {
  await supabaseAdmin
    .from("external_api_cost_ledger")
    .update({
      status:     "charged",
      output_url: outputUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("job_id", jobId)
    .eq("stage", stage)
    .eq("request_hash", requestHash)
    .neq("status", "charged"); // safety: never re-write a committed charge
}

// ── Self-Healing Reconciliation ────────────────────────────────────────────────

/**
 * Find jobs where an API was charged (cost ledger = 'charged') but the
 * execution ledger does not yet show 'completed' for that stage.
 *
 * This happens when a worker:
 *   1. Called the external API (charge incurred)
 *   2. Marked cost ledger 'charged'
 *   3. Crashed before calling completeLedgerEntry
 *
 * Recovery cannot safely re-run the stage (API was already paid) — it must
 * instead reconcile the stage ledger from the cost ledger's output_url.
 */
export async function findCostDesynced(): Promise<
  Array<{ job_id: string; stage: string; provider: string; output_url: string }>
> {
  const { data: charged } = await supabaseAdmin
    .from("external_api_cost_ledger")
    .select("job_id, stage, provider, output_url")
    .eq("status", "charged")
    .not("output_url", "is", null)
    .limit(50);

  if (!charged?.length) return [];

  const desynced: Array<{
    job_id: string;
    stage: string;
    provider: string;
    output_url: string;
  }> = [];

  for (const entry of charged) {
    if (!entry.output_url) continue;
    const { data: ledger } = await supabaseAdmin
      .from("avatar_stage_ledger")
      .select("status")
      .eq("job_id", entry.job_id)
      .eq("stage", entry.stage)
      .maybeSingle();

    if (!ledger || ledger.status !== "completed") {
      desynced.push(entry as { job_id: string; stage: string; provider: string; output_url: string });
    }
  }

  return desynced;
}

/**
 * Clear execution ledger and cost firewall entries for a stage.
 *
 * Called by Pass 5 storage reconciliation when a completed ledger entry has no
 * corresponding storage artifact — the DB was updated but the file is missing.
 *
 * Deleting both entries allows the next worker to:
 *   1. Re-call the external API (cost firewall no longer blocks)
 *   2. Re-upload the artifact (ledger no longer shows completed)
 *
 * Only call for unlocked queued jobs — same restriction as DAG repair.
 */
export async function clearStageForStorageRepair(
  jobId: string,
  stage: string,
): Promise<void> {
  await Promise.all([
    supabaseAdmin
      .from("avatar_stage_ledger")
      .delete()
      .eq("job_id", jobId)
      .eq("stage", stage),
    supabaseAdmin
      .from("external_api_cost_ledger")
      .delete()
      .eq("job_id", jobId)
      .eq("stage", stage),
  ]);
}

/**
 * Reconcile a stage ledger entry from the cost ledger.
 * Writes a 'completed' ledger row using the known output_url from the
 * cost ledger.  Does NOT advance the job stage — that is left to the next
 * worker invocation, which will see the ledger hit and skip the API call.
 *
 * The 'reconciled' execution_id is a sentinel indicating automated repair.
 * Never overwrites an existing 'completed' entry.
 */
export async function reconcileStageFromCost(
  jobId: string,
  stage: string,
  outputUrl: string,
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from("avatar_stage_ledger")
    .select("status")
    .eq("job_id", jobId)
    .eq("stage", stage)
    .maybeSingle();

  if (existing?.status === "completed") return; // nothing to repair

  if (existing) {
    await supabaseAdmin
      .from("avatar_stage_ledger")
      .update({
        execution_id: "reconciled",
        status:       "completed",
        output_url:   outputUrl,
        error:        null,
        updated_at:   new Date().toISOString(),
      })
      .eq("job_id", jobId)
      .eq("stage", stage)
      .neq("status", "completed");
  } else {
    await supabaseAdmin
      .from("avatar_stage_ledger")
      .insert({
        job_id:       jobId,
        stage,
        execution_id: "reconciled",
        status:       "completed",
        output_url:   outputUrl,
      });
  }
}
