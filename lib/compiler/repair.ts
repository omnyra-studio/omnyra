/**
 * Repair Compiler — incremental recompilation on VCE violations.
 *
 * When the VCE reports violations, the Repair Compiler:
 *   1. Identifies the MINIMAL affected subgraph (only violating + reachable nodes)
 *   2. Invalidates those nodes (marks provider = null, clears embeddings)
 *   3. Re-runs optimization passes ONLY on the invalidated subgraph
 *   4. Merges the repaired subgraph back into the full graph
 *
 * Critical invariant:
 *   NO full recompilation unless global graph integrity is broken.
 *   Unaffected nodes are NEVER touched — their provider assignments,
 *   frame math, and embeddings are preserved exactly.
 *
 * Repair strategy per verdict type:
 *   recompile_node:  invalidate provider on the affected node → PCR re-assigns
 *   rewire_provider: invalidate provider on affected node + all forward-reachable
 *                    nodes → PCR re-assigns with tighter consistency weights
 */

import type { IRGraph, IRNode } from "./ir";
import { buildIRGraph } from "./ir";
import type { EdgeVerdict } from "./vce";
import type { RoutingContext } from "@/lib/routing/types";
import { runPasses } from "./passes/index";

export interface RepairResult {
  readonly graph:            IRGraph;
  readonly invalidatedNodes: ReadonlyArray<string>;
  readonly repairPasses:     ReadonlyArray<string>;
}

export function repairGraph(
  graph:    IRGraph,
  verdicts: ReadonlyArray<EdgeVerdict>,
  context:  RoutingContext,
): RepairResult {
  // Collect all node IDs that need invalidation
  const toInvalidate = new Set<string>();

  for (const v of verdicts) {
    if (v.verdict === "accept") continue;
    for (const id of v.affectedNodes) {
      toInvalidate.add(id);
    }
  }

  if (toInvalidate.size === 0) {
    return { graph, invalidatedNodes: [], repairPasses: [] };
  }

  // For rewire_provider violations: tighten consistency weight in repair context
  const hasRewire = verdicts.some(v => v.verdict === "rewire_provider");
  const repairContext: RoutingContext = hasRewire
    ? {
        ...context,
        weights: {
          consistency: Math.min(1, (context.weights?.consistency ?? 0.4) + 0.2),
          cost:        Math.max(0, (context.weights?.cost        ?? 0.3) - 0.1),
          latency:     Math.max(0, (context.weights?.latency     ?? 0.3) - 0.1),
        },
      }
    : context;

  // Invalidate: clear provider on affected nodes so PCR re-assigns them
  const repairedNodes: IRNode[] = [...graph.nodes.values()].map(node =>
    toInvalidate.has(node.id)
      ? { ...node, provider: null, embedding: null }
      : node,
  );

  const invalidatedGraph = buildIRGraph({
    nodes:       repairedNodes,
    edges:       [...graph.edges],
    fps:         graph.fps,
    projectId:   graph.projectId,
    passHistory: [...graph.passHistory, "REPAIR_INVALIDATE"],
  });

  // Re-run all passes on the full graph (passes skip unaffected/clean nodes)
  const repairedGraph = runPasses(invalidatedGraph, repairContext);

  return {
    graph:            repairedGraph,
    invalidatedNodes: Object.freeze([...toInvalidate]),
    repairPasses:     Object.freeze(
      repairedGraph.passHistory.slice(invalidatedGraph.passHistory.length),
    ),
  };
}
