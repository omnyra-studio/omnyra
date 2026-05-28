/**
 * Contract diff engine — identifies exactly which clips changed between two
 * ValidRenderContracts so only changed clips trigger shard re-execution.
 *
 * Hash strategy:
 *   Clip hash     = FNV-1a 32-bit over all render-relevant fields
 *                   (videoAssetId + audioAssetId + frame math + meta)
 *   Contract hash = FNV-1a over all clip hashes + context (projectId, fps, totalFrames)
 *
 * FNV-1a 32-bit properties: fast, synchronous, pure, zero dependencies.
 * Suitable for cache keying — not security-critical.
 */

import type { ValidRenderClip, ValidRenderContract } from "@/lib/timeline/contract";
import type { ContractDiff } from "./types";
import { semanticsAreEquivalent } from "@/lib/compiler/semantic-hash";

// ── Hash primitives ────────────────────────────────────────────────────────────

function fnv1a(str: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h  = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Deterministic clip fingerprint. Covers every field that affects render output.
 * Two clips with the same hash are render-identical — the worker may skip re-execution.
 */
export function hashClip(clip: ValidRenderClip): string {
  return fnv1a(JSON.stringify({
    id:                 clip.id,
    videoAssetId:       clip.videoAssetId,
    audioAssetId:       clip.audioAssetId,
    startFrame:         clip.startFrame,
    endFrame:           clip.endFrame,
    renderFrames:       clip.renderFrames,
    targetFrames:       clip.targetFrames,
    paddingFrames:      clip.paddingFrames,
    energyCurve:        clip.meta.energyCurve,
    transitionIn:       clip.meta.transitionIn,
    transitionAfter:    clip.meta.transitionAfter,
    transitionDuration: clip.meta.transitionDuration,
    zoomEffect:         clip.meta.zoomEffect,
  }));
}

/**
 * Deterministic contract fingerprint. Changes whenever any clip changes
 * OR when fps / totalFrames / projectId changes. Used as the shard cache namespace.
 */
export function hashContract(contract: ValidRenderContract): string {
  const inner = contract.clips.map(hashClip).join(",");
  return fnv1a(`${contract.projectId}:${contract.fps}:${contract.totalDurationFrames}:${inner}`);
}

// ── Diff ───────────────────────────────────────────────────────────────────────

/**
 * Compute the delta between two successive contracts.
 *
 * Identity: a clip's shot_id (clip.id) is its stable identity across renders.
 * Equality: two clips with the same id AND the same hashClip() are unchanged.
 *
 * changedClipIds is the set used by the execution planner to mark shards dirty.
 */
export function diffContracts(
  next:     ValidRenderContract,
  previous: ValidRenderContract,
): ContractDiff {
  const prevById = new Map(previous.clips.map(c => [c.id, c]));
  const nextIds  = new Set(next.clips.map(c => c.id));

  const addedClips:     ValidRenderClip[] = [];
  const removedClips:   ValidRenderClip[] = [];
  const modifiedClips:  ValidRenderClip[] = [];
  const unchangedClips: ValidRenderClip[] = [];

  for (const clip of next.clips) {
    const prev = prevById.get(clip.id);
    if (!prev) {
      addedClips.push(clip);
    } else if (!semanticsAreEquivalent(clip, prev)) {
      // Semantic equivalence: clips within SEMANTIC_EQ_THRESHOLD cosine distance
      // are treated as unchanged — avoids re-rendering for incidental field changes
      // that don't affect visual output. Lexical hashClip() is still used for
      // shard cache keys (exactness required there).
      modifiedClips.push(clip);
    } else {
      unchangedClips.push(clip);
    }
  }

  for (const clip of previous.clips) {
    if (!nextIds.has(clip.id)) removedClips.push(clip);
  }

  const changedClipIds = new Set<string>([
    ...addedClips.map(c => c.id),
    ...removedClips.map(c => c.id),
    ...modifiedClips.map(c => c.id),
  ]);

  return Object.freeze<ContractDiff>({
    addedClips:     Object.freeze(addedClips)     as ReadonlyArray<ValidRenderClip>,
    removedClips:   Object.freeze(removedClips)   as ReadonlyArray<ValidRenderClip>,
    modifiedClips:  Object.freeze(modifiedClips)  as ReadonlyArray<ValidRenderClip>,
    unchangedClips: Object.freeze(unchangedClips) as ReadonlyArray<ValidRenderClip>,
    hasChanges:     changedClipIds.size > 0,
    changedClipIds: Object.freeze(changedClipIds) as ReadonlySet<string>,
  });
}
