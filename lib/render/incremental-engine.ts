/**
 * Incremental Render Engine — top-level orchestrator for the execution runtime.
 *
 * rebuildRender() is the single entry point for any render operation:
 *   1. Diff (if previousContract provided) — identifies changed clips
 *   2. Plan — builds ExecutionPlan with per-shard dirty flags
 *   3. Cache check — batch-fetches all shard outputs (one DB round-trip)
 *   4. Returns IncrementalRenderPlan split into cachedShards + pendingShards
 *
 * Callers execute pendingShards (via processShardJob), then call mergeShards()
 * with all shard outputs combined.
 *
 * Cache semantics:
 *   - A shard with a cache hit is NEVER re-executed regardless of diff status.
 *     The cache is the authoritative gate — the diff is an optimistic hint only.
 *   - A shard with no cache hit is always executed, even if diff says "clean".
 *     This handles the case where a cache entry was evicted or never written.
 *
 * This means: "no full re-render unless contract hash changes AND no cache hit"
 */

import type { ValidRenderContract } from "@/lib/timeline/contract";
import type {
  ContractDiff,
  ExecutionPlan,
  IncrementalRenderPlan,
  RenderShard,
  ShardCacheEntry,
} from "./types";
import { diffContracts } from "./diff-contract";
import { planExecution } from "./execution-planner";
import { getShardCache } from "./shard-cache";

export async function rebuildRender(
  contract:          ValidRenderContract,
  projectId:         string,
  previousContract?: ValidRenderContract,
): Promise<IncrementalRenderPlan> {
  const diff: ContractDiff | null = previousContract
    ? diffContracts(contract, previousContract)
    : null;

  const plan: ExecutionPlan = planExecution(contract, projectId, diff ?? undefined);

  // Batch-check cache for all shards — one DB round-trip for the full plan
  const cacheHits = await getShardCache().getBatch(plan.shards.map(s => s.cacheKey));

  const cachedShards:  ShardCacheEntry[] = [];
  const pendingShards: RenderShard[]     = [];

  for (const shard of plan.shards) {
    const hit = cacheHits.get(shard.cacheKey);
    if (hit) {
      cachedShards.push(hit);
    } else {
      pendingShards.push(shard);
    }
  }

  return Object.freeze<IncrementalRenderPlan>({
    plan,
    diff,
    cachedShards:  Object.freeze(cachedShards)  as ReadonlyArray<ShardCacheEntry>,
    pendingShards: Object.freeze(pendingShards) as ReadonlyArray<RenderShard>,
  });
}
