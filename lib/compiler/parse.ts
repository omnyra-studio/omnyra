/**
 * AST Parser — transforms a ValidRenderContract into an initial IRGraph.
 *
 * This is the only crossing point from the contract layer into the IR layer.
 * The parser is strictly additive: it reads the contract and constructs IR nodes
 * and edges without modifying or re-interpreting any contract values.
 *
 * Edge construction:
 *   Temporal edges:  between every pair of adjacent clips (startFrame continuity)
 *   Semantic edges:  between clips sharing the same energyCurve (subject continuity proxy)
 *
 * All IR nodes start with:
 *   status   = "active"
 *   provider = null       (assigned by PCR pass)
 *   embedding = null      (injected by VCE or external embedding service)
 *   fusedWith = null      (set by NF pass)
 */

import type { ValidRenderContract } from "@/lib/timeline/contract";
import type { IRNode, IREdge, IRGraph } from "./ir";
import { buildIRGraph } from "./ir";
import { hashContract } from "@/lib/render/diff-contract";

export function parseAST(contract: ValidRenderContract): { graph: IRGraph; contractHash: string } {
  const contractHash = hashContract(contract);
  const nodes: IRNode[] = contract.clips.map(clip => ({
    id:           clip.id,
    index:        clip.index,
    shotNumber:   clip.shotNumber,
    videoAssetId: clip.videoAssetId,
    audioAssetId: clip.audioAssetId,
    startFrame:   clip.startFrame,
    endFrame:     clip.endFrame,
    renderFrames: clip.renderFrames,
    targetFrames: clip.targetFrames,
    paddingFrames: clip.paddingFrames,
    meta:         clip.meta,
    status:       "active" as const,
    fusedWith:    null,
    provider:     null,
    embedding:    null,
    localityOrder: null,
  }));

  const edges: IREdge[] = [];

  // Temporal edges: adjacent clip pairs (the primary ordering structure)
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({ from: nodes[i].id, to: nodes[i + 1].id, type: "temporal", drift: null });
  }

  // Semantic edges: clips sharing energyCurve (proxy for subject/scene continuity)
  const byCurve = new Map<string, string[]>();
  for (const n of nodes) {
    const key = n.meta.energyCurve;
    if (!byCurve.has(key)) byCurve.set(key, []);
    byCurve.get(key)!.push(n.id);
  }

  for (const group of byCurve.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length - 1; i++) {
      // Only add semantic edge if not already covered by a temporal edge
      const isTemporallyAdjacent = edges.some(
        e => e.type === "temporal" && e.from === group[i] && e.to === group[i + 1],
      );
      if (!isTemporallyAdjacent) {
        edges.push({ from: group[i], to: group[i + 1], type: "semantic", drift: null });
      }
    }
  }

  const graph = buildIRGraph({
    nodes,
    edges,
    fps:       contract.fps,
    projectId: contract.projectId,
  });

  return { graph, contractHash };
}

// Re-export IRGraph type for convenience
export type { IRGraph } from "./ir";
