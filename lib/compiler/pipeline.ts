/**
 * Deterministic Media Compilation Engine (DMCE v4) — full compilation pipeline.
 *
 * compile() is the single entry point. Executes 9 stages in order:
 *
 *   1. Parse AST        → ValidRenderContract → initial IRGraph
 *   2. Semantic Embed   → inject 32-d semantic embeddings into all active IR nodes
 *   3. Optimize         → run passes (DNE, PCR, NF, TEC, ELO) until convergence
 *   4. VCE              → compute drift on all adjacent-node pairs (pre-execution)
 *   5. Repair           → if VCE violations, invalidate minimal subgraph + re-optimize
 *   6. Re-VCE           → verify repair resolved all violations
 *                         HARD REJECT: unresolved violations throw VCEConstraintError —
 *                         no incoherent plan may be scheduled
 *   7. Route + PNL      → routeContract → applyPNL (coherence-first provider normalization)
 *   8. Build plan       → VCE-aware shard boundaries via planExecution(vce=finalVCE)
 *   9. Build artifact   → content-addressed RenderArtifact + emit events
 *
 * Determinism proof:
 *   All hashes are FNV-1a of deterministic inputs (IDs, frame math, provider IDs).
 *   routeProvider() uses hash(projectId + clipId + mode) as seed — no randomness.
 *   Semantic embeddings are seeded from clip metadata — no randomness.
 *   PNL scoring is deterministic given identical profiles and clip metadata.
 *   → Identical (contract + context) → identical artifact at every stage.
 *
 * VCE as compile-time constraint solver (v4 change):
 *   VCE violations surviving the Repair Compiler are now HARD REJECTIONS.
 *   The execution planner receives the final VCE result and inserts shard boundaries
 *   at all drift zone transitions (drift > DRIFT_RECOMPILE_NODE).
 */

import type { ValidRenderContract } from "@/lib/timeline/contract";
import type { RoutingContext, RoutedRenderContract } from "@/lib/routing/types";
import type { ExecutionPlan } from "@/lib/render/types";
import type { RenderArtifact } from "./artifact";
import type { IRGraph, IRNode } from "./ir";
import { buildIRGraph, activeNodes } from "./ir";
import { parseAST } from "./parse";
import { runPasses } from "./passes/index";
import { runVCE, VCEConstraintError } from "./vce";
import { repairGraph } from "./repair";
import { buildArtifact } from "./artifact";
import { buildSemanticEmbedding } from "./semantic-hash";
import { applyPNL } from "./pnl";
import { routeContract } from "@/lib/routing/route-contract";
import { planExecution } from "@/lib/render/execution-planner";
import { emitAndForget } from "@/lib/events/emitter";

export { VCEConstraintError } from "./vce";

export interface CompilationResult {
  readonly routedContract: RoutedRenderContract;
  readonly plan:           ExecutionPlan;
  readonly artifact:       RenderArtifact;
  readonly irGraph:        IRGraph;
}

// ── Stage 2: Semantic embedding injection ─────────────────────────────────────
//
// Injects 32-d semantic embeddings into all active IR nodes before optimization
// passes run. Passes (especially ELO) and VCE use these embeddings for locality
// optimization and drift computation respectively.

function injectSemanticEmbeddings(graph: IRGraph): IRGraph {
  const updatedNodes: IRNode[] = [...graph.nodes.values()].map(node => {
    if (node.status !== "active" || node.embedding !== null) return node;
    return { ...node, embedding: buildSemanticEmbedding(node) };
  });

  return buildIRGraph({
    nodes:       updatedNodes,
    edges:       [...graph.edges],
    fps:         graph.fps,
    projectId:   graph.projectId,
    passHistory: [...graph.passHistory, "SEM_EMBED"],
  });
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export async function compile(
  contract: ValidRenderContract,
  context:  RoutingContext,
): Promise<CompilationResult> {

  // ── Stage 1: Parse AST → initial IR ─────────────────────────────────────────
  const { graph: rawGraph, contractHash } = parseAST(contract);

  // ── Stage 2: Inject semantic embeddings ──────────────────────────────────────
  const embeddedGraph = injectSemanticEmbeddings(rawGraph);

  // ── Stage 3: Optimization passes (converge, max 3 iterations) ───────────────
  const optimizedGraph = runPasses(embeddedGraph, context);

  // ── Stage 4: VCE — drift validation on optimized graph (pre-execution) ───────
  const vceResult = runVCE(optimizedGraph);

  // ── Stages 5–6: Repair + re-validate (HARD REJECT on remaining violations) ───
  let finalGraph = vceResult.graph;
  let finalVCE   = vceResult;

  if (!vceResult.valid) {
    const violations = vceResult.verdicts.filter(v => v.verdict !== "accept");
    console.warn(`[dmce] VCE: ${violations.length} violation(s) → running Repair Compiler`);

    const repairResult  = repairGraph(finalGraph, violations, context);
    // Re-inject semantic embeddings after repair: the Repair Compiler clears
    // embedding=null on invalidated nodes. Without re-injection, re-VCE would
    // fall back to pseudo-random proxy embeddings → spurious violations → false rejection.
    const repairedEmbed = injectSemanticEmbeddings(repairResult.graph);

    // Stage 6: re-validate — HARD REJECT if violations remain
    finalVCE   = runVCE(repairedEmbed);
    finalGraph = finalVCE.graph;

    if (!finalVCE.valid) {
      const remaining = finalVCE.verdicts.filter(v => v.verdict !== "accept");
      // VCE is a compile-time constraint solver — no incoherent plan may be scheduled
      throw new VCEConstraintError(remaining, remaining.length);
    }
  }

  // ── Stage 7: Route contract + PNL normalization ───────────────────────────────
  const routedRaw      = routeContract(contract, context);
  const routedContract = applyPNL(routedRaw);

  // ── Stage 8: Build execution plan (VCE-aware shard boundaries) ───────────────
  // Pass finalVCE so the planner can break shards at coherence zone transitions
  const plan = planExecution(routedContract, contract.projectId, undefined, finalVCE);

  // ── Stage 9: Emit RenderArtifact + events ────────────────────────────────────
  const artifact = buildArtifact(finalGraph, plan, finalVCE, contractHash);

  emitAndForget({
    type:          "RENDER_CONTRACT_BUILT",
    correlationId: contract.projectId,
    payload: {
      planId:      contract.projectId,
      clipCount:   contract.clips.length,
      fps:         contract.fps,
      totalFrames: contract.totalDurationFrames,
      status:      "valid",
    },
  });

  console.log(
    `[dmce] v4 compilation complete — ` +
    `${contract.clips.length} clips, ${plan.totalShards} shards, ` +
    `passes=[${artifact.passHistory.join(",")}], ` +
    `vce=${finalVCE.valid ? "PASS" : "VIOLATIONS_REMAIN"}, ` +
    `pnl=applied, contractHash=${contractHash}`,
  );

  return { routedContract, plan, artifact, irGraph: finalGraph };
}
