/**
 * Pass: Embedding Locality Optimization (ELO)
 *
 * Annotates active IRNodes with a preferred intra-shard position (localityOrder)
 * to minimize perceptual drift between adjacent clips within each shard.
 *
 * Design change from original implementation:
 *   ELO no longer attempts to reorder nodes in the IRGraph. The IRGraph ordering
 *   is locked to startFrame (the canonical timeline order), and buildIRGraph()
 *   enforces this invariant. Any reordering would be immediately undone.
 *
 *   Instead, ELO sets IRNode.localityOrder: number on each active node.
 *   The execution planner uses localityOrder to sort clips within each shard
 *   by visual similarity before dispatching to the worker. This achieves
 *   intra-shard locality without violating the IRGraph ordering invariant.
 *
 * Locality scoring:
 *   When node.embedding is set (injected by pipeline Stage 2), ELO uses
 *   cosine similarity between 32-d semantic embeddings.
 *   Otherwise, ELO uses a proxy: clips with the same energyCurve +
 *   transitionIn + provider are considered more similar.
 *
 * Semantic equivalence invariant:
 *   ELO only sets localityOrder on nodes — it never changes id, startFrame,
 *   endFrame, videoAssetId, or any render-relevant field.
 */

import type { IRGraph, IRNode } from "../ir";
import { buildIRGraph, activeNodes } from "../ir";

function proxySimilarity(a: IRNode, b: IRNode): number {
  let sim = 0;
  if (a.meta.energyCurve === b.meta.energyCurve)        sim += 0.4;
  if (a.meta.transitionIn === b.meta.transitionIn)      sim += 0.3;
  if (a.provider !== null && a.provider === b.provider) sim += 0.3;
  return sim;
}

function cosineSimilarity(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function similarity(a: IRNode, b: IRNode): number {
  if (a.embedding && b.embedding) return cosineSimilarity(a.embedding, b.embedding);
  return proxySimilarity(a, b);
}

export function elo(graph: IRGraph): IRGraph {
  const active = activeNodes(graph);
  if (active.length <= 1) return graph;

  // Group active nodes by provider (locality is per-provider-group = per-shard)
  const groups: IRNode[][] = [];
  let   cur:    IRNode[]   = [active[0]];

  for (let i = 1; i < active.length; i++) {
    const prev = cur[cur.length - 1];
    const node = active[i];
    if (node.provider !== null && prev.provider !== null && node.provider !== prev.provider) {
      groups.push(cur);
      cur = [node];
    } else {
      cur.push(node);
    }
  }
  groups.push(cur);

  // Within each group: greedy nearest-neighbor to compute preferred local order
  const localityMap = new Map<string, number>();  // nodeId → preferred position within shard
  let   changed     = false;

  for (const group of groups) {
    if (group.length <= 1) {
      localityMap.set(group[0].id, 0);
      continue;
    }

    const remaining = [...group];
    const ordered   = [remaining.shift()!];

    while (remaining.length > 0) {
      const last    = ordered[ordered.length - 1];
      let   bestIdx = 0;
      let   bestSim = -1;

      for (let i = 0; i < remaining.length; i++) {
        const s = similarity(last, remaining[i]);
        if (s > bestSim) { bestSim = s; bestIdx = i; }
      }

      ordered.push(remaining.splice(bestIdx, 1)[0]);
    }

    // Assign localityOrder values (0, 1, 2, ...) to each node
    for (let i = 0; i < ordered.length; i++) {
      localityMap.set(ordered[i].id, i);
      if (ordered[i].id !== group[i].id) changed = true;
    }
  }

  if (!changed) return graph;

  // Annotate nodes with localityOrder — does NOT reorder them (startFrame order preserved)
  const annotatedNodes: IRNode[] = [...graph.nodes.values()].map(node =>
    localityMap.has(node.id)
      ? { ...node, localityOrder: localityMap.get(node.id)! }
      : node,
  );

  return buildIRGraph({
    nodes:       annotatedNodes,
    edges:       [...graph.edges],
    fps:         graph.fps,
    projectId:   graph.projectId,
    passHistory: [...graph.passHistory, "ELO"],
  });
}
