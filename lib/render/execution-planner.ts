/**
 * Execution Planner — compiles a ValidRenderContract into an ExecutionPlan.
 *
 * Sharding rules:
 *   - Clips are grouped in timeline order; planner NEVER re-sorts
 *   - MAX_SHARD_CLIPS clips per shard (4 clips × 15 s = 60 s ceiling)
 *   - Shard boundaries are deterministic: same clips + same order = same shard
 *   - A shard is "pending"   if NO diff, or if ANY of its clips are in changedClipIds
 *   - A shard is "cached"    only when ALL its clips are unchanged per diff
 *     (cache eligibility is confirmed with a real cache lookup in incremental-engine)
 *
 * Workers are stateless executors — they receive a precompiled RenderShard and
 * perform no DAG building, no validation, no frame normalization.
 */

import type { ValidRenderContract, ValidRenderClip } from "@/lib/timeline/contract";
import type { RoutedRenderContract, RoutedRenderClip } from "@/lib/routing/types";
import type { RenderShard, ExecutionPlan, ContractDiff } from "./types";
import type { VCEResult } from "@/lib/compiler/vce";
import { DRIFT_RECOMPILE_NODE } from "@/lib/compiler/vce";
import { hashClip, hashContract } from "./diff-contract";

export const MAX_SHARD_CLIPS = 4;   // 4 × 15 s = 60 s per shard ceiling

function getProvider(clip: ValidRenderClip): string | null {
  return (clip as RoutedRenderClip).provider ?? null;
}

// Internal shard fingerprint — includes contractHash so keys are namespaced per contract
function fnv1a(str: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h  = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function shardCacheKey(
  contractHash: string,
  shardIdx:     number,
  clips:        ReadonlyArray<ValidRenderClip>,
): string {
  const clipsDigest = clips.map(hashClip).join(",");
  return fnv1a(`${contractHash}:s${shardIdx}:${clipsDigest}`);
}

/**
 * Compile a ValidRenderContract (or RoutedRenderContract) into an ExecutionPlan.
 *
 * Sharding strategy:
 *   - When provider info is absent (plain ValidRenderContract): pure temporal grouping
 *   - When provider info is present (RoutedRenderContract): also break at provider
 *     transitions so each shard contains clips from a single provider only.
 *     This enables provider-homogeneous workers and eliminates model cold-start churn.
 *
 * @param contract   The validated (and optionally routed) contract to plan.
 * @param projectId  Used as part of planId and cache namespace.
 * @param diff       Optional diff. If absent, all shards are marked "pending".
 * @param vce        Optional VCE result. When present, shard boundaries are also
 *                   inserted at edges whose drift exceeds DRIFT_RECOMPILE_NODE,
 *                   ensuring each shard is a coherence-stable execution unit.
 */
export function planExecution(
  contract:  ValidRenderContract | RoutedRenderContract,
  projectId: string,
  diff?:     ContractDiff,
  vce?:      VCEResult,
): ExecutionPlan {
  const contractHash = hashContract(contract as ValidRenderContract);
  const changedIds   = diff?.changedClipIds ?? null;
  const clips        = contract.clips as ReadonlyArray<ValidRenderClip>;
  const shards:      RenderShard[] = [];

  // Pre-build drift map from VCE verdicts for O(1) edge lookup
  const driftMap: Map<string, number> | null = vce
    ? new Map(vce.verdicts.map(v => [`${v.fromId}→${v.toId}`, v.drift]))
    : null;

  let i        = 0;
  let shardIdx = 0;

  while (i < clips.length) {
    const shardClips: ValidRenderClip[] = [];
    const firstProvider                 = getProvider(clips[i]);

    while (i < clips.length && shardClips.length < MAX_SHARD_CLIPS) {
      const clipProvider = getProvider(clips[i]);

      // Break at provider transition when provider info is available
      if (
        firstProvider !== null &&
        clipProvider  !== null &&
        clipProvider  !== firstProvider
      ) {
        break;
      }

      // Break at VCE coherence zone boundary (drift too high between adjacent clips).
      // This keeps each shard within a single coherence zone — workers see only
      // semantically-continuous clip sequences, preventing intra-shard drift artifacts.
      if (driftMap !== null && shardClips.length > 0) {
        const prevId = shardClips[shardClips.length - 1].id;
        const currId = clips[i].id;
        const drift  = driftMap.get(`${prevId}→${currId}`);
        if (drift !== undefined && drift > DRIFT_RECOMPILE_NODE) {
          break;
        }
      }

      shardClips.push(clips[i]);
      i++;
    }

    const startFrame      = shardClips[0].startFrame;
    const endFrame        = shardClips[shardClips.length - 1].endFrame;
    const durationSeconds = (endFrame - startFrame) / contract.fps;
    const cacheKey        = shardCacheKey(contractHash, shardIdx, shardClips);
    const isDirty         = !diff || shardClips.some(c => changedIds!.has(c.id));

    // Apply ELO locality ordering within the shard when available.
    // localityOrder is set by the ELO pass on IRNodes; plain ValidRenderClip won't have it.
    // Sorting within a shard by localityOrder places visually similar clips adjacent,
    // reducing perceptual drift at the executor level without violating timeline order.
    const hasLocality = shardClips.some(c => (c as any).localityOrder != null);
    if (hasLocality) {
      shardClips.sort((a, b) => {
        const la = (a as any).localityOrder ?? 999;
        const lb = (b as any).localityOrder ?? 999;
        return la - lb;
      });
    }

    // Shard provider: non-null only if all clips share one provider
    const uniqueProviders = [...new Set(shardClips.map(c => getProvider(c)).filter(Boolean))];
    const shardProvider   = uniqueProviders.length === 1 ? uniqueProviders[0] : null;

    shards.push(Object.freeze<RenderShard>({
      shardId:         `${contractHash.slice(0, 6)}_s${shardIdx}`,
      index:           shardIdx,
      clips:           Object.freeze(shardClips) as ReadonlyArray<ValidRenderClip>,
      startFrame,
      endFrame,
      durationSeconds,
      clipCount:       shardClips.length,
      cacheKey,
      status:          isDirty ? "pending" : "cached",
      outputUrl:       null,
      provider:        shardProvider,
    }));

    shardIdx++;
  }

  return Object.freeze<ExecutionPlan>({
    planId:       `${projectId}_${contractHash}`,
    projectId,
    contractHash,
    shards:       Object.freeze(shards) as ReadonlyArray<RenderShard>,
    totalShards:  shards.length,
    totalClips:   contract.clips.length,
    totalFrames:  contract.totalDurationFrames,
    fps:          contract.fps,
    plannedAt:    new Date().toISOString(),
  });
}
