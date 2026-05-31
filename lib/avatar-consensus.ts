/**
 * Avatar pipeline consensus engine.
 *
 * Unified reconciliation authority across all correctness domains:
 *
 *   Pass 1 — Lease recovery
 *     Jobs stuck in 'processing' with an expired lease are reclaimed and
 *     their stale ledger entries cleared.  Workers that have genuinely died
 *     become visible here.  Jobs that have exhausted their per-stage retry
 *     cap are permanently failed.
 *
 *   Pass 2 — Cost-ledger reconciliation
 *     Cases where an external API was charged (cost ledger = 'charged')
 *     but the execution ledger was not updated (crash between markCostCharged
 *     and completeLedgerEntry).  The execution ledger is rebuilt from the cost
 *     ledger's output_url, allowing the next worker to skip the API call and
 *     advance the stage at zero additional cost.
 *
 *   Pass 3 — Orphaned trigger recovery
 *     Jobs that are 'queued' with a non-null stage but haven't been touched
 *     in > 10 minutes.  The inter-stage retrigger fetch silently failed.
 *     No state repair needed — these are safe to re-trigger.
 *
 *   Pass 4 — DAG repair
 *     Cases where job.stage disagrees with the stage the DAG would derive
 *     from the live ledger state (completed stages).  The DB is updated to
 *     match ledger truth.  Only runs on unlocked queued jobs to avoid
 *     conflicting with an active worker.
 *
 *   Pass 5 — Storage artifact reconciliation
 *     Cases where a completed TTS ledger entry has no real storage artifact
 *     backing it (upload crashed after DB write, file was deleted, or the
 *     Supabase storage write returned success but the object is absent).
 *     Clears both execution-ledger and cost-firewall entries so the next
 *     worker can re-execute the TTS stage from scratch, including re-uploading.
 *     Only runs on unlocked queued jobs.  Only checks the 'tts' stage — the
 *     sole stage writing to Supabase Storage in the current DAG.
 *
 * Design invariants:
 *   - Completed ledger entries are NEVER modified (immutable truth)
 *   - DAG repair and storage repair only touch unlocked jobs (locked_by IS NULL)
 *   - Worker triggers are returned as a list, not fired here — the caller
 *     decides when to fire (typically inside after() in the recovery route)
 *   - All passes are independent and safe to run concurrently on different jobs
 */

import { supabaseAdmin } from "./supabase/admin";
import {
  type AvatarJob,
  type PipelineStage,
  reclaimExpiredLease,
  permanentlyFailJob,
  resetLedgerForStage,
  reconcileStageFromCost,
  repairJobStage,
  getCompletedStages,
  clearStageForStorageRepair,
  STAGE_MAX_RETRIES,
} from "./avatar-queue";
import { resolveNextStage } from "./avatar-pipeline";
import { storageArtifactExists } from "./storage-artifact";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ConsensusAction {
  pass:   1 | 2 | 3 | 4 | 5;
  type:   string;
  detail: string;
}

export interface ConsensusReport {
  jobId:           string;
  actions:         ConsensusAction[];
  requiresTrigger: boolean;
}

export interface ConsensusResult {
  reports:   ConsensusReport[];
  toTrigger: string[];     // deduplicated job IDs needing a worker trigger
  stats: {
    jobs_scanned:       number;
    leases_reclaimed:   number;
    permanently_failed: number;
    costs_reconciled:   number;
    dags_repaired:      number;
    orphans_found:      number;
    storage_repaired:   number;
  };
}

// ── Per-job consensus ──────────────────────────────────────────────────────────

/**
 * Run all five consensus passes against a single job.
 * Returns a structured report including whether a worker trigger is needed.
 */
export async function runJobConsensus(job: AvatarJob): Promise<ConsensusReport> {
  const actions: ConsensusAction[] = [];
  let requiresTrigger = false;

  // ── Pass 1: Lease recovery ─────────────────────────────────────────────────
  if (job.status === "processing" && job.lease_expires_at) {
    const leaseExpired = new Date(job.lease_expires_at) < new Date();
    if (leaseExpired) {
      const stage      = (job.stage as PipelineStage | null) ?? "tts";
      const stageCount = job.retry_count_per_stage?.[stage] ?? 0;
      const maxRetries = STAGE_MAX_RETRIES[stage] ?? 2;

      if (stageCount >= maxRetries) {
        await permanentlyFailJob(
          job.id,
          `consensus: stage=${stage} exhausted ${stageCount}/${maxRetries} retries (last: ${job.error ?? "unknown"})`,
        );
        actions.push({
          pass:   1,
          type:   "permanently_failed",
          detail: `stage=${stage} retries=${stageCount}/${maxRetries}`,
        });
      } else {
        const reclaimed = await reclaimExpiredLease(job.id);
        if (reclaimed) {
          await resetLedgerForStage(job.id, stage);
          actions.push({
            pass:   1,
            type:   "lease_reclaimed",
            detail: `stage=${stage} retries=${stageCount}/${maxRetries} ledger_reset=true`,
          });
          requiresTrigger = true;
        }
      }
    }
  }

  // ── Pass 2: Cost-ledger reconciliation ────────────────────────────────────
  // Only meaningful for jobs still in flight — completed/failed are final.
  if (job.status === "queued" || job.status === "processing") {
    const { data: charged } = await supabaseAdmin
      .from("external_api_cost_ledger")
      .select("stage, output_url")
      .eq("job_id", job.id)
      .eq("status", "charged")
      .not("output_url", "is", null);

    for (const entry of charged ?? []) {
      if (!entry.output_url) continue;
      const { data: ledger } = await supabaseAdmin
        .from("avatar_stage_ledger")
        .select("status")
        .eq("job_id", job.id)
        .eq("stage", entry.stage)
        .maybeSingle();

      if (!ledger || ledger.status !== "completed") {
        await reconcileStageFromCost(job.id, entry.stage, entry.output_url);
        actions.push({
          pass:   2,
          type:   "cost_reconciled",
          detail: `stage=${entry.stage} output_url=${entry.output_url.substring(0, 60)}`,
        });
        requiresTrigger = true;
      }
    }
  }

  // ── Pass 3: Orphaned trigger (handled at query level, just mark trigger) ──
  // Jobs in this state were selected because updated_at is stale; no state
  // repair needed — the job is already in the correct queued state.
  if (
    job.status === "queued" &&
    job.stage !== null &&
    !job.locked_by &&
    actions.length === 0  // not already being handled by pass 1 or 2
  ) {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000);
    if (new Date(job.updated_at) < cutoff) {
      actions.push({
        pass:   3,
        type:   "orphan_trigger",
        detail: `stage=${job.stage} stale since ${job.updated_at}`,
      });
      requiresTrigger = true;
    }
  }

  // ── Pass 4: DAG repair ─────────────────────────────────────────────────────
  // Detect and correct job.stage drift against ledger truth.
  // Only runs on unlocked queued jobs (no active worker holds the job).
  if (job.status === "queued" && !job.locked_by) {
    const completedStages = await getCompletedStages(job.id);
    const dagStage        = resolveNextStage(completedStages);

    if (dagStage && dagStage !== job.stage) {
      const repaired = await repairJobStage(job.id, dagStage);
      if (repaired) {
        actions.push({
          pass:   4,
          type:   "dag_repaired",
          detail: `job.stage corrected from=${job.stage ?? "null"} to=${dagStage}`,
        });
        requiresTrigger = true;
      }
    }
  }

  // ── Pass 5: Storage artifact reconciliation ────────────────────────────────
  // Verify that completed TTS ledger entries have real Supabase Storage
  // objects backing them.  If the file is missing, clear both ledger and cost
  // entries so the next worker can re-run TTS (including the ElevenLabs call
  // and upload) without hitting a false positive in the cost firewall.
  //
  // Only runs on unlocked queued jobs — same restriction as DAG repair.
  // Only checks 'tts' — the sole DAG stage writing to Supabase Storage.
  if (job.status === "queued" && !job.locked_by) {
    const { data: ttsLedger } = await supabaseAdmin
      .from("avatar_stage_ledger")
      .select("output_url")
      .eq("job_id", job.id)
      .eq("stage", "tts")
      .eq("status", "completed")
      .maybeSingle();

    if (ttsLedger?.output_url) {
      const exists = await storageArtifactExists(job.id, "tts");
      if (!exists) {
        await clearStageForStorageRepair(job.id, "tts");
        actions.push({
          pass:   5,
          type:   "storage_repaired",
          detail: `stage=tts artifact missing — ledger + cost cleared for re-execution`,
        });
        requiresTrigger = true;
      }
    }
  }

  return { jobId: job.id, actions, requiresTrigger };
}

// ── System-wide consensus ──────────────────────────────────────────────────────

/**
 * Run full consensus across all jobs that may need attention.
 * Returns structured results and a deduplicated list of job IDs to trigger.
 * The caller is responsible for firing triggers (typically inside after()).
 */
export async function runSystemConsensus(): Promise<ConsensusResult> {
  const now    = new Date().toISOString();
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const stats = {
    jobs_scanned:       0,
    leases_reclaimed:   0,
    permanently_failed: 0,
    costs_reconciled:   0,
    dags_repaired:      0,
    orphans_found:      0,
    storage_repaired:   0,
  };

  // Gather candidates across all failure classes in one query
  const { data: candidates } = await supabaseAdmin
    .from("avatar_jobs")
    .select("*")
    .or(
      `and(status.eq.processing,lease_expires_at.lt.${now}),` +
      `and(status.eq.queued,stage.not.is.null,updated_at.lt.${cutoff})`,
    )
    .limit(40);

  stats.jobs_scanned = candidates?.length ?? 0;

  const reports: ConsensusReport[] = [];
  const triggerSet = new Set<string>();

  for (const rawJob of candidates ?? []) {
    const job = rawJob as AvatarJob;
    try {
      const report = await runJobConsensus(job);

      if (report.actions.length > 0) {
        reports.push(report);

        for (const action of report.actions) {
          if (action.type === "lease_reclaimed")    stats.leases_reclaimed++;
          if (action.type === "permanently_failed") stats.permanently_failed++;
          if (action.type === "cost_reconciled")    stats.costs_reconciled++;
          if (action.type === "dag_repaired")       stats.dags_repaired++;
          if (action.type === "orphan_trigger")     stats.orphans_found++;
          if (action.type === "storage_repaired")   stats.storage_repaired++;
        }
      }

      if (report.requiresTrigger) {
        triggerSet.add(job.id);
      }
    } catch (err) {
      console.error(`[consensus] job=${job.id} error:`, err instanceof Error ? err.message : err);
    }
  }

  // ── Supplement 1: Global cost-desync scan ─────────────────────────────────
  // Catches jobs not in the candidate set that still have unreconciled cost entries.
  const { data: allCharged } = await supabaseAdmin
    .from("external_api_cost_ledger")
    .select("job_id, stage, output_url")
    .eq("status", "charged")
    .not("output_url", "is", null)
    .limit(50);

  for (const entry of allCharged ?? []) {
    if (!entry.output_url) continue;
    if (triggerSet.has(entry.job_id)) continue;

    const { data: ledger } = await supabaseAdmin
      .from("avatar_stage_ledger")
      .select("status")
      .eq("job_id", entry.job_id)
      .eq("stage", entry.stage)
      .maybeSingle();

    if (!ledger || ledger.status !== "completed") {
      await reconcileStageFromCost(entry.job_id, entry.stage, entry.output_url);
      stats.costs_reconciled++;
      triggerSet.add(entry.job_id);
      reports.push({
        jobId:           entry.job_id,
        actions:         [{ pass: 2, type: "cost_reconciled_global", detail: `stage=${entry.stage}` }],
        requiresTrigger: true,
      });
    }
  }

  // ── Supplement 2: Global storage artifact scan ────────────────────────────
  // Catches completed TTS ledger entries for active jobs where the storage
  // artifact is missing — even when the job isn't stale enough to appear in
  // the candidate set (e.g., job was re-queued recently but artifact is gone).
  // Only checks unlocked queued jobs to avoid conflicting with active workers.
  const { data: completedTts } = await supabaseAdmin
    .from("avatar_stage_ledger")
    .select("job_id, output_url")
    .eq("stage", "tts")
    .eq("status", "completed")
    .not("output_url", "is", null)
    .limit(20);

  for (const entry of completedTts ?? []) {
    if (!entry.output_url) continue;
    if (triggerSet.has(entry.job_id)) continue;

    // Only repair active, unlocked jobs
    const { data: activeJob } = await supabaseAdmin
      .from("avatar_jobs")
      .select("id")
      .eq("id", entry.job_id)
      .eq("status", "queued")
      .is("locked_by", null)
      .maybeSingle();

    if (!activeJob) continue;

    const exists = await storageArtifactExists(entry.job_id, "tts");
    if (!exists) {
      await clearStageForStorageRepair(entry.job_id, "tts");
      stats.storage_repaired++;
      triggerSet.add(entry.job_id);
      reports.push({
        jobId:           entry.job_id,
        actions:         [{ pass: 5, type: "storage_repaired_global", detail: `stage=tts artifact missing` }],
        requiresTrigger: true,
      });
    }
  }

  return {
    reports,
    toTrigger: [...triggerSet],
    stats,
  };
}
