/**
 * Pass: Provider Cost Rewriting (PCR)
 *
 * Assigns a provider to every active IRNode using the PRE scoring function.
 * This is the bridge between the provider-agnostic IR and the execution layer.
 *
 * The PCR pass delegates all scoring logic to routeProvider() (lib/routing/).
 * It adds no new scoring logic — it only maps provider decisions onto IR nodes.
 *
 * Selection function (per spec):
 *   score(p, n) = latency(p) + failureRate(p, n.style) + driftRisk(p, n.subject) + cost(p)
 *   → argmin(score)
 *
 * Implemented as: argmax of the inverse (consistency + inverseCost + inverseLatency)
 * which is algebraically equivalent with inverted sign conventions.
 *
 * Semantic equivalence invariant:
 *   Provider assignment does not change what is rendered — only which executor
 *   renders it. Active nodes with identical videoAssetId produce identical output
 *   regardless of provider assignment.
 */

import type { IRGraph, IRNode } from "../ir";
import { buildIRGraph } from "../ir";
import type { RoutingContext } from "@/lib/routing/types";
import { routeProvider } from "@/lib/routing/provider-router";

export function pcr(graph: IRGraph, context: RoutingContext): IRGraph {
  let changed = false;
  const nodes: IRNode[] = [];

  for (const id of graph.order) {
    const node = graph.nodes.get(id)!;

    if (node.status !== "active") {
      nodes.push(node);
      continue;
    }

    const decision = routeProvider(
      { id: node.id, shotNumber: node.shotNumber },
      context,
    );

    if (node.provider !== decision.providerId) {
      nodes.push({ ...node, provider: decision.providerId });
      changed = true;
    } else {
      nodes.push(node);
    }
  }

  if (!changed) return graph;

  return buildIRGraph({
    nodes,
    edges:       [...graph.edges],
    fps:         graph.fps,
    projectId:   graph.projectId,
    passHistory: [...graph.passHistory, "PCR"],
  });
}
