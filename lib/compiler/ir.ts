/**
 * Intermediate Representation (IR) for the Deterministic Media Compilation Engine.
 *
 * The IR sits between the input AST (ValidRenderContract) and the execution layer.
 * It is the ONLY layer where optimization passes operate. The contract is never
 * mutated — the IR is derived from it and transformed through passes.
 *
 * Layer separation:
 *   AST  (ValidRenderContract)   — declarative, immutable input
 *   IR   (IRGraph)               — normalized DAG, mutable within passes, provider-agnostic
 *   Exec (ExecutionPlan)         — provider-bound, shard-assigned output
 *
 * IRGraph is functional — every pass returns a NEW IRGraph. The input is never mutated.
 * passHistory accumulates the name of each applied pass in order.
 */

import type { ClipMeta } from "@/lib/timeline/contract";
import type { ProviderId } from "@/lib/routing/types";

// ── IR Node — one compilation unit ────────────────────────────────────────────
//
// Corresponds to one RenderClip in the contract. The IR adds compiler-state
// fields (status, fusedWith) and embedding data for the VCE.

export type IRNodeStatus = "active" | "dead" | "fused";

export interface IRNode {
  // Identity (stable — never changed by passes)
  readonly id:          string;
  readonly index:       number;
  readonly shotNumber:  number;

  // Asset bindings (from contract — never changed by passes)
  readonly videoAssetId: string;
  readonly audioAssetId: string;

  // Frame math (from contract — never changed by passes)
  readonly startFrame:   number;
  readonly endFrame:     number;
  readonly renderFrames: number;
  readonly targetFrames: number;
  readonly paddingFrames: number;

  // Director metadata (from contract — never changed by passes)
  readonly meta: ClipMeta;

  // Compiler-mutable state (changed ONLY by optimization passes)
  readonly status:    IRNodeStatus;
  readonly fusedWith: string | null;    // id of the surviving node when this is fused
  readonly provider:  ProviderId | null; // set by PCR pass

  // VCE embedding vector (set by VCE pass; null until computed)
  readonly embedding: ReadonlyArray<number> | null;

  // ELO locality ordering — preferred intra-shard position for embedding-based locality.
  // Set by the ELO pass. The execution planner uses this to sort clips within each shard
  // by visual similarity rather than by startFrame (which defines inter-shard order).
  // null = no ELO preference; lower = place earlier within the shard.
  readonly localityOrder: number | null;
}

// ── IR Edge — dependency declaration ──────────────────────────────────────────
//
// Temporal edges: A precedes B in the timeline (A.endFrame = B.startFrame).
// Semantic edges: A and B share a subject or scene continuity constraint.
// drift: cosine distance of embeddings [0, 1]; set by VCE. null until computed.

export type IREdgeType = "temporal" | "semantic";

export interface IREdge {
  readonly from:  string;
  readonly to:    string;
  readonly type:  IREdgeType;
  readonly drift: number | null;   // null until VCE runs
}

// ── IR Graph ──────────────────────────────────────────────────────────────────
//
// nodes:       keyed by IRNode.id for O(1) lookup
// edges:       all edges including redundant ones (TEC pass removes them)
// order:       topologically sorted node IDs (by startFrame) — authoritative ordering
// passHistory: ordered list of pass names applied to this graph

export interface IRGraph {
  readonly nodes:       ReadonlyMap<string, IRNode>;
  readonly edges:       ReadonlyArray<IREdge>;
  readonly order:       ReadonlyArray<string>;   // stable topological ordering
  readonly fps:         number;
  readonly projectId:   string;
  readonly passHistory: ReadonlyArray<string>;
  readonly compiledAt:  string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Active nodes in timeline order — the primary traversal view. */
export function activeNodes(graph: IRGraph): IRNode[] {
  return graph.order
    .map(id => graph.nodes.get(id)!)
    .filter(n => n.status === "active");
}

/** Temporal successors of a node (nodes this node has a temporal edge to). */
export function successors(graph: IRGraph, nodeId: string): IRNode[] {
  return graph.edges
    .filter(e => e.from === nodeId && e.type === "temporal")
    .map(e => graph.nodes.get(e.to)!)
    .filter(Boolean);
}

/** Build an IRGraph from a set of nodes and edges. Freezes everything. */
export function buildIRGraph(params: {
  nodes:        IRNode[];
  edges:        IREdge[];
  fps:          number;
  projectId:    string;
  passHistory?: string[];
}): IRGraph {
  const nodeMap = new Map<string, IRNode>(params.nodes.map(n => [n.id, n]));

  // Topological order: sort by startFrame (contract guarantees no overlap)
  const order = [...nodeMap.keys()].sort(
    (a, b) => nodeMap.get(a)!.startFrame - nodeMap.get(b)!.startFrame,
  );

  return Object.freeze({
    nodes:       nodeMap as ReadonlyMap<string, IRNode>,
    edges:       Object.freeze([...params.edges]),
    order:       Object.freeze(order),
    fps:         params.fps,
    projectId:   params.projectId,
    passHistory: Object.freeze(params.passHistory ?? []),
    compiledAt:  new Date().toISOString(),
  });
}
