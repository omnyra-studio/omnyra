/**
 * Render Execution Engine — shared types.
 *
 * The engine transforms a static ValidRenderContract into a distributed,
 * incremental, cached execution graph:
 *
 *   ValidRenderContract
 *     → diffContracts()      lib/render/diff-contract.ts
 *     → planExecution()      lib/render/execution-planner.ts
 *     → rebuildRender()      lib/render/incremental-engine.ts
 *     → processShardJob()    lib/workers/shard-worker.ts  (parallel per shard)
 *     → mergeShards()        lib/render/merge.ts
 *     → final video
 *
 * System invariants:
 *   1. Identical contract → identical shard plan (deterministic planning)
 *   2. Unchanged clips are never re-rendered (cache hit skips composer)
 *   3. Workers execute precompiled instructions only — no DAG, no validation
 *   4. Shards are independent; no cross-shard dependencies
 *   5. Merge output is deterministic — stateless, purely compositional
 */

import type { ValidRenderClip } from "@/lib/timeline/contract";
export type { ValidRenderClip };

// ── RenderShard — independent execution unit ───────────────────────────────────
//
// A shard is a temporally-contiguous, bounded group of clips assigned to
// one worker invocation. All shards execute in parallel. No shard may depend
// on the output of another shard before being submitted for execution.

export interface RenderShard {
  readonly shardId:         string;
  readonly index:           number;
  readonly clips:           ReadonlyArray<ValidRenderClip>;
  readonly startFrame:      number;
  readonly endFrame:        number;
  readonly durationSeconds: number;
  readonly clipCount:       number;
  readonly cacheKey:        string;   // deterministic key for cache lookup
  readonly status:          ShardStatus;
  readonly outputUrl:       string | null;  // null until executed or cache-populated
  readonly provider:        string | null;  // non-null when all clips share one provider (set by execution planner from RoutedRenderContract)
}

export type ShardStatus = "pending" | "cached" | "executing" | "completed" | "failed";

// ── ExecutionPlan — compiled from ValidRenderContract ─────────────────────────
//
// Immutable, frozen. planId is stable for a given (projectId, contractHash) pair.
// Identical inputs → identical plan (required for cache correctness).

export interface ExecutionPlan {
  readonly planId:        string;
  readonly projectId:     string;
  readonly contractHash:  string;
  readonly shards:        ReadonlyArray<RenderShard>;
  readonly totalShards:   number;
  readonly totalClips:    number;
  readonly totalFrames:   number;
  readonly fps:           number;
  readonly plannedAt:     string;   // ISO-8601 audit
}

// ── ContractDiff ──────────────────────────────────────────────────────────────
//
// Output of diffContracts(next, previous).
// changedClipIds drives shard dirtiness — a shard is pending if ANY of its
// clips appear in changedClipIds; otherwise it is eligible for cache reuse.

export interface ContractDiff {
  readonly addedClips:     ReadonlyArray<ValidRenderClip>;
  readonly removedClips:   ReadonlyArray<ValidRenderClip>;
  readonly modifiedClips:  ReadonlyArray<ValidRenderClip>;
  readonly unchangedClips: ReadonlyArray<ValidRenderClip>;
  readonly hasChanges:     boolean;
  readonly changedClipIds: ReadonlySet<string>;   // O(1) lookup for planner
}

// ── ShardCacheEntry ────────────────────────────────────────────────────────────

export interface ShardCacheEntry {
  readonly cacheKey:        string;
  readonly shardId:         string;
  readonly outputUrl:       string;
  readonly durationSeconds: number;
  readonly cachedAt:        string;   // ISO-8601
}

// ── IncrementalRenderPlan — output of rebuildRender() ─────────────────────────
//
// Splits the work into cachedShards (no execution needed) and pendingShards
// (must be executed before calling mergeShards()).

export interface IncrementalRenderPlan {
  readonly plan:          ExecutionPlan;
  readonly diff:          ContractDiff | null;    // null = first render, no previous contract
  readonly cachedShards:  ReadonlyArray<ShardCacheEntry>;
  readonly pendingShards: ReadonlyArray<RenderShard>;
}

// ── MergeResult ───────────────────────────────────────────────────────────────

export interface MergeResult {
  readonly videoUrl:        string;   // composer output URL (not yet uploaded to storage)
  readonly durationSeconds: number;
}
