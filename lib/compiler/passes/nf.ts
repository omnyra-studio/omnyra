/**
 * Pass: Node Fusion (NF)
 *
 * Fuses adjacent active nodes that share the same provider and have a simple
 * transition between them (hard_cut or cut). Fused nodes are combined into
 * a single logical "super-node" that the executor treats as one unit.
 *
 * Fusion rules:
 *   1. Both nodes must be "active"
 *   2. Same provider (or both have null provider — defer fusion to after PCR)
 *   3. Merged duration ≤ MAX_FUSED_DURATION_S (30 s = 2 × SEGMENT_DURATION_S)
 *   4. transitionAfter of the first node must be "cut" or "hard_cut"
 *
 * The SECOND node is marked "fused" (fusedWith = first.id).
 * The FIRST node absorbs the second: its endFrame and targetFrames are extended.
 *
 * Semantic equivalence invariant:
 *   Fusing N clips into one super-node produces the same video as rendering them
 *   separately and concatenating. Clip order is preserved. Frame math is preserved.
 */

import type { IRGraph, IRNode } from "../ir";
import { buildIRGraph } from "../ir";

const MAX_FUSED_DURATION_S  = 30;

export function nf(graph: IRGraph): IRGraph {
  const nodes    = [...graph.order].map(id => ({ ...graph.nodes.get(id)! })) as IRNode[];
  let   changed  = false;

  for (let i = 0; i < nodes.length - 1; i++) {
    const curr = nodes[i];
    const next = nodes[i + 1];

    if (curr.status !== "active" || next.status !== "active") continue;

    // Only fuse when provider info is set and matching (PCR must have run first,
    // or both are null — defer if both are null)
    if (curr.provider !== next.provider) continue;
    if (curr.provider === null) continue;    // defer until PCR assigns providers

    // Transition must be simple
    if (curr.meta.transitionAfter !== "cut" && curr.meta.transitionAfter !== "hard_cut") continue;

    // Duration ceiling
    const mergedDurationFrames = next.endFrame - curr.startFrame;
    const mergedDurationS      = mergedDurationFrames / graph.fps;
    if (mergedDurationS > MAX_FUSED_DURATION_S) continue;

    // Fuse: extend curr to absorb next; mark next as fused
    nodes[i] = {
      ...curr,
      endFrame:      next.endFrame,
      targetFrames:  curr.targetFrames + next.targetFrames,
      renderFrames:  curr.renderFrames + next.renderFrames,
      paddingFrames: curr.paddingFrames + next.paddingFrames,
    };
    nodes[i + 1] = {
      ...next,
      status:    "fused",
      fusedWith: curr.id,
    };

    changed = true;
  }

  if (!changed) return graph;

  return buildIRGraph({
    nodes:       nodes,
    edges:       [...graph.edges],
    fps:         graph.fps,
    projectId:   graph.projectId,
    passHistory: [...graph.passHistory, "NF"],
  });
}
