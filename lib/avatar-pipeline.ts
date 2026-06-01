/**
 * Avatar pipeline DAG definition and cost firewall metadata.
 *
 * Separates structural concerns (what runs, what depends on what, what it costs)
 * from execution concerns (how it runs, how it retries).
 *
 * The DAG is the authoritative source for:
 *  - stage dependency resolution (what is safe to execute next)
 *  - request hash computation (idempotent API-call fingerprinting)
 *  - cost estimates (economic safety + billing attribution)
 *  - provider identity (circuit breaker + rate-limit attribution)
 */

import { createHash } from "crypto";
import type { PipelineStage } from "./avatar-queue";

// ── DAG types ──────────────────────────────────────────────────────────────────

export interface DagNode {
  stage: PipelineStage;
  provider: string;
  dependencies: PipelineStage[];
  creditEstimate: number;      // Omnyra credit cost for this stage
  maxRetries: number;
  leaseDurationMs: number;     // Maximum wall-clock time for this stage
}

// ── Pipeline DAG (linear for now, extensible to parallel) ─────────────────────

export const AVATAR_DAG: readonly DagNode[] = [
  {
    stage:           "tts",
    provider:        "elevenlabs",
    dependencies:    [],
    creditEstimate:  3,
    maxRetries:      3,
    leaseDurationMs: 3 * 60 * 1000,
  },
  {
    stage:           "animate",
    provider:        "hedra-bypass",  // Kling bypassed — Hedra handles image+audio directly
    dependencies:    ["tts"],
    creditEstimate:  0,
    maxRetries:      1,
    leaseDurationMs: 30 * 1000,      // near-instant pass-through
  },
  {
    stage:           "lipsync",
    provider:        "hedra",
    dependencies:    ["animate"],
    creditEstimate:  15,
    maxRetries:      1,
    leaseDurationMs: 8 * 60 * 1000,
  },
] as const;

// ── DAG resolution ─────────────────────────────────────────────────────────────

export function getDagNode(stage: PipelineStage): DagNode {
  const node = AVATAR_DAG.find(n => n.stage === stage);
  if (!node) throw new Error(`No DAG node for stage: ${stage}`);
  return node;
}

/**
 * Given the set of stages confirmed completed in the ledger, returns the next
 * stage that is safe to execute (all dependencies completed).
 *
 * Returns null when all stages are done or no executable stage exists
 * (dependency not yet satisfied — indicates a ledger inconsistency).
 */
export function resolveNextStage(
  completedStages: Set<string>,
): PipelineStage | null {
  for (const node of AVATAR_DAG) {
    if (completedStages.has(node.stage)) continue;
    if (node.dependencies.every(dep => completedStages.has(dep))) {
      return node.stage;
    }
  }
  return null;
}

/**
 * Resolve the executable stage from live ledger state, with fallback to
 * job.stage when the ledger is empty (first execution, no prior completions).
 *
 * Detects job.stage / DAG desync and trusts the ledger.
 */
export function resolveStageFromLedger(
  jobStage: string | null,
  completedStages: Set<string>,
): PipelineStage {
  const dagNext = resolveNextStage(completedStages);

  if (!dagNext) {
    // All DAG stages completed — caller should not have claimed this job
    throw new Error("resolveStageFromLedger: all stages completed, no work to do");
  }

  if (jobStage && jobStage !== dagNext) {
    console.warn(
      `[avatar-dag] stage desync: job.stage=${jobStage} dag.next=${dagNext} — trusting DAG`,
    );
  }

  return dagNext;
}

// ── Request hash computation ───────────────────────────────────────────────────
//
// A request hash is the deterministic fingerprint of a specific external API
// call.  Same inputs → same hash → same charge.  The cost firewall uses these
// hashes as the dedup key in external_api_cost_ledger.

export function ttsRequestHash(
  voiceId: string,
  script: string,
): string {
  return createHash("sha256")
    .update(`elevenlabs|eleven_turbo_v2|${voiceId}|${script}`)
    .digest("hex");
}

export function animateRequestHash(
  imageUrl: string,
): string {
  return createHash("sha256")
    .update(`kling|i2v-pro|v2.1|10s|9:16|0.35|${imageUrl}|scene-planner-v1`)
    .digest("hex");
}

export function hedraRequestHash(
  imageUrl: string,
  audioUrl: string,
): string {
  return createHash("sha256")
    .update(`hedra|character-2|${imageUrl}|${audioUrl}`)
    .digest("hex");
}
