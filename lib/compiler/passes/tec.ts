/**
 * Pass: Temporal Edge Compression (TEC)
 *
 * Removes redundant temporal edges — those already implied by the node ordering.
 *
 * In a linear timeline A→B→C:
 *   The edge A→C is redundant because the path A→B→C already exists.
 *   Redundant edges add noise to the graph, slow VCE traversal, and
 *   inflate the edge set without adding semantic information.
 *
 * Algorithm: transitive reduction of temporal edges.
 *   For each temporal edge (u, v): if there exists a path from u to v
 *   that does NOT use the direct edge (u, v), mark (u, v) as redundant.
 *
 * Semantic equivalence invariant:
 *   Removing a transitive temporal edge does not change any ordering
 *   constraint. The surviving minimal edge set is semantically equivalent.
 *
 * Only temporal edges are compressed. Semantic edges are preserved as-is.
 */

import type { IRGraph, IREdge } from "../ir";
import { buildIRGraph } from "../ir";

export function tec(graph: IRGraph): IRGraph {
  // Build adjacency for temporal edges only
  const temporalAdj = new Map<string, Set<string>>();

  for (const edge of graph.edges) {
    if (edge.type !== "temporal") continue;
    if (!temporalAdj.has(edge.from)) temporalAdj.set(edge.from, new Set());
    temporalAdj.get(edge.from)!.add(edge.to);
  }

  // For each temporal edge (u, v): check if v is reachable from u via other nodes
  function reachableWithout(from: string, to: string): boolean {
    const visited = new Set<string>();
    const queue: string[] = [];

    // BFS from from's neighbors, excluding the direct edge (from → to)
    for (const n of (temporalAdj.get(from) ?? [])) {
      if (n === to) continue;  // skip direct edge
      queue.push(n);
    }

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur === to) return true;
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const next of (temporalAdj.get(cur) ?? [])) {
        queue.push(next);
      }
    }
    return false;
  }

  const redundant = new Set<string>();

  for (const edge of graph.edges) {
    if (edge.type !== "temporal") continue;
    const key = `${edge.from}→${edge.to}`;

    if (reachableWithout(edge.from, edge.to)) {
      redundant.add(key);
    }
  }

  if (redundant.size === 0) return graph;

  const compressedEdges = graph.edges.filter(e => {
    if (e.type !== "temporal") return true;
    return !redundant.has(`${e.from}→${e.to}`);
  });

  return buildIRGraph({
    nodes:       [...graph.nodes.values()],
    edges:       compressedEdges,
    fps:         graph.fps,
    projectId:   graph.projectId,
    passHistory: [...graph.passHistory, "TEC"],
  });
}
