/**
 * Pass: Dead Node Elimination (DNE)
 *
 * Marks IRNodes as "dead" if they contribute nothing to the final render:
 *   - Zero-duration nodes (renderFrames = 0)
 *
 * Dead nodes are NOT removed from the graph — they are marked status="dead"
 * so the audit trail and downstream passes can observe them.
 * Only "active" nodes enter execution.
 *
 * Semantic equivalence invariant:
 *   Active nodes after DNE produce an output semantically equivalent to
 *   the full node set. A zero-duration node renders no frames and cannot
 *   affect any output.
 *
 * NOTE: videoAssetId-based duplicate elimination was removed. Two shots may
 * legitimately share the same video URL but have different audio, metadata,
 * or transitions — eliminating them would break narrative continuity.
 * Render-equivalent duplicate detection lives in diffContracts() (semantic
 * hash) and the shard cache (lexical hash), not in the IR pass layer.
 */

import type { IRGraph, IRNode } from "../ir";
import { buildIRGraph } from "../ir";

export function dne(graph: IRGraph): IRGraph {
  const newNodes: IRNode[] = [];
  let   changed   = false;

  for (const id of graph.order) {
    const node = graph.nodes.get(id)!;

    if (node.status !== "active") {
      newNodes.push(node);
      continue;
    }

    // Zero-duration elimination
    if (node.renderFrames <= 0) {
      newNodes.push({ ...node, status: "dead", fusedWith: null });
      changed = true;
      continue;
    }

    newNodes.push(node);
  }

  if (!changed) return graph;

  return buildIRGraph({
    nodes:       newNodes,
    edges:       [...graph.edges],
    fps:         graph.fps,
    projectId:   graph.projectId,
    passHistory: [...graph.passHistory, "DNE"],
  });
}
