/**
 * Visual Coherence Engine (VCE) — compile-time identity constraint solver.
 *
 * The VCE validates that adjacent clips in the optimized IR do not exceed
 * visual drift thresholds. Drift is measured as the cosine distance between
 * embedding vectors of adjacent nodes.
 *
 * Drift classification (per spec):
 *   drift ≤ 0.20 → ACCEPT
 *   drift ≤ 0.50 → RECOMPILE_NODE   (flag node for re-generation at execution time)
 *   drift  > 0.50 → REWIRE_PROVIDER  + subgraph invalidation
 *
 * Embedding strategy:
 *   Production: inject CLIP or DINO embeddings via node.embedding (set externally).
 *   Development: deterministic proxy embedding derived from node's video URL hash.
 *     The proxy captures some signal (same URL → same vector) but is NOT a
 *     substitute for real vision embeddings. Replace before production use.
 *
 * The VCE is a COMPILE-TIME constraint solver. It does not monitor at runtime.
 * Violations discovered here are handled by the Repair Compiler before execution.
 */

import type { IRGraph, IRNode, IREdge } from "./ir";
import { buildIRGraph, activeNodes } from "./ir";

// ── Drift thresholds (per spec) ───────────────────────────────────────────────

export const DRIFT_ACCEPT         = 0.20;
export const DRIFT_RECOMPILE_NODE = 0.50;

export type DriftVerdict =
  | "accept"
  | "recompile_node"   // node should be re-generated with tighter constraints
  | "rewire_provider"; // switch provider + invalidate subgraph

export interface EdgeVerdict {
  readonly fromId:        string;
  readonly toId:          string;
  readonly drift:         number;
  readonly verdict:       DriftVerdict;
  readonly affectedNodes: ReadonlyArray<string>;  // nodes to invalidate for "rewire"
}

export interface VCEResult {
  readonly valid:      boolean;
  readonly verdicts:   ReadonlyArray<EdgeVerdict>;
  readonly graph:      IRGraph;  // graph with drift values written onto edges
}

/**
 * Thrown by pipeline.ts when VCE violations remain after the Repair Compiler.
 * Signals a compile-time constraint failure — the plan may NOT be scheduled.
 */
export class VCEConstraintError extends Error {
  constructor(
    public readonly violations:      ReadonlyArray<EdgeVerdict>,
    public readonly violationCount:  number,
  ) {
    super(
      `[dmce] VCE constraint failure: ${violationCount} edge(s) exceed drift threshold ` +
      `after repair — execution plan rejected`,
    );
    this.name = "VCEConstraintError";
  }
}

// ── Embedding computation ─────────────────────────────────────────────────────

function fnv1a(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h  = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// Deterministic 16-d proxy embedding from a string seed.
// IMPORTANT: Replace with real CLIP/DINO embeddings before production use.
function proxyEmbedding(seed: string, dims = 16): number[] {
  const vec: number[] = [];
  for (let d = 0; d < dims; d++) {
    const h = fnv1a(`${seed}:${d}`);
    vec.push((h / 0xffffffff) * 2 - 1);  // normalize to [-1, 1]
  }
  // L2-normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}

function getEmbedding(node: IRNode): number[] {
  if (node.embedding) return [...node.embedding];
  return proxyEmbedding(node.videoAssetId + ":" + node.id);
}

function cosineDist(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  // vectors are L2-normalized → dot product IS cosine similarity
  return 1 - dot;   // distance = 1 - similarity
}

// ── Subgraph invalidation ─────────────────────────────────────────────────────
// For "rewire_provider" violations: invalidate the violating node PLUS all
// nodes that have a temporal path through it (its successors in the DAG).

function forwardReachable(graph: IRGraph, startId: string): string[] {
  const visited = new Set<string>();
  const queue   = [startId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    for (const edge of graph.edges) {
      if (edge.from === id && edge.type === "temporal" && !visited.has(edge.to)) {
        queue.push(edge.to);
      }
    }
  }

  visited.delete(startId);  // startId itself is the violating node, not a downstream
  return [...visited];
}

// ── VCE pass ──────────────────────────────────────────────────────────────────

export function runVCE(graph: IRGraph): VCEResult {
  const nodes     = activeNodes(graph);
  const verdicts: EdgeVerdict[] = [];
  const driftMap  = new Map<string, number>();   // "from→to" → drift

  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];

    const embA  = getEmbedding(a);
    const embB  = getEmbedding(b);
    const drift = cosineDist(embA, embB);

    driftMap.set(`${a.id}→${b.id}`, drift);

    let verdict: DriftVerdict;
    let affected: string[];

    if (drift <= DRIFT_ACCEPT) {
      verdict  = "accept";
      affected = [];
    } else if (drift <= DRIFT_RECOMPILE_NODE) {
      verdict  = "recompile_node";
      affected = [b.id];
    } else {
      verdict  = "rewire_provider";
      affected = [b.id, ...forwardReachable(graph, b.id)];
    }

    verdicts.push(Object.freeze({
      fromId:        a.id,
      toId:          b.id,
      drift,
      verdict,
      affectedNodes: Object.freeze(affected),
    }));
  }

  // Write drift values back onto the edges
  const updatedEdges: IREdge[] = graph.edges.map(e => {
    const key  = `${e.from}→${e.to}`;
    const drift = driftMap.get(key);
    return drift !== undefined ? { ...e, drift } : e;
  });

  const updatedGraph = buildIRGraph({
    nodes:       [...graph.nodes.values()],
    edges:       updatedEdges,
    fps:         graph.fps,
    projectId:   graph.projectId,
    passHistory: [...graph.passHistory, "VCE"],
  });

  const hasViolations = verdicts.some(v => v.verdict !== "accept");

  return Object.freeze<VCEResult>({
    valid:    !hasViolations,
    verdicts: Object.freeze(verdicts),
    graph:    updatedGraph,
  });
}
