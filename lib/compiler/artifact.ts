/**
 * RenderArtifact — the immutable, content-addressed record of a compilation.
 *
 * Every compilation emits one RenderArtifact. The artifact contains:
 *   - Deterministic hashes of every compilation stage
 *   - The provider map (nodeId → providerId) for audit and replay
 *   - VCE result summary
 *   - The full pass history
 *
 * Hash guarantee (Replay System):
 *   Identical (contract + RoutingContext + mode) → identical artifact hashes.
 *   This enables:
 *     - Detecting when a re-compile would produce the same result (cache skip)
 *     - Audit trails that prove determinism across re-runs
 *     - Git-style rollback: restore any prior artifact to reproduce an exact render
 *
 * Hash function: FNV-1a 64-bit (two 32-bit rounds chained).
 * Frame hashes: per-node hash of (id + videoAssetId + startFrame + provider).
 */

import type { IRGraph } from "./ir";
import type { ExecutionPlan } from "@/lib/render/types";
import type { VCEResult } from "./vce";
import { activeNodes } from "./ir";

// ── Hash ──────────────────────────────────────────────────────────────────────

function fnv1a(str: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h  = Math.imul(h, 16777619) >>> 0;
  }
  // Second round for better distribution (simulates 64-bit)
  let h2 = h ^ 0xdeadbeef;
  for (let i = str.length - 1; i >= 0; i--) {
    h2 ^= str.charCodeAt(i);
    h2  = Math.imul(h2, 16777619) >>> 0;
  }
  return (h.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0"));
}

// ── Artifact ──────────────────────────────────────────────────────────────────

export interface RenderArtifact {
  // Content-addressed hashes
  readonly contractHash:      string;   // hash of the input ValidRenderContract
  readonly irGraphHash:       string;   // hash of the optimized IR graph
  readonly executionPlanHash: string;   // hash of the compiled execution plan

  // Per-node frame hashes — one per active node
  readonly frameHashes: ReadonlyArray<string>;

  // Provider assignments for audit + replay
  readonly providerMap: Readonly<Record<string, string>>;

  // VCE summary
  readonly vce: {
    readonly valid:          boolean;
    readonly violationCount: number;
    readonly verdicts:       ReadonlyArray<{
      fromId: string;
      toId:   string;
      drift:  number;
      verdict: string;
    }>;
  };

  // Audit trail
  readonly passHistory:  ReadonlyArray<string>;
  readonly compiledAt:   string;
  readonly projectId:    string;
}

function hashIRGraph(graph: IRGraph): string {
  const nodes = activeNodes(graph).map(n =>
    `${n.id}:${n.videoAssetId}:${n.startFrame}:${n.endFrame}:${n.provider ?? "null"}`,
  ).join("|");
  return fnv1a(`ir:${graph.projectId}:${nodes}:${graph.passHistory.join(",")}`);
}

function hashExecutionPlan(plan: ExecutionPlan): string {
  const shards = plan.shards.map(s =>
    `${s.shardId}:${s.clipCount}:${s.provider ?? "null"}:${s.cacheKey}`,
  ).join("|");
  return fnv1a(`plan:${plan.projectId}:${plan.contractHash}:${shards}`);
}

export function buildArtifact(
  graph:           IRGraph,
  plan:            ExecutionPlan,
  vceResult:       VCEResult,
  contractHash:    string,
): RenderArtifact {
  const nodes      = activeNodes(graph);
  const frameHashes = nodes.map(n =>
    fnv1a(`${n.id}:${n.videoAssetId}:${n.startFrame}:${n.provider ?? "null"}`),
  );

  const providerMap: Record<string, string> = {};
  for (const node of nodes) {
    if (node.provider) providerMap[node.id] = node.provider;
  }

  return Object.freeze<RenderArtifact>({
    contractHash,
    irGraphHash:       hashIRGraph(graph),
    executionPlanHash: hashExecutionPlan(plan),
    frameHashes:       Object.freeze(frameHashes),
    providerMap:       Object.freeze(providerMap),
    vce: Object.freeze({
      valid:          vceResult.valid,
      violationCount: vceResult.verdicts.filter(v => v.verdict !== "accept").length,
      verdicts:       Object.freeze(vceResult.verdicts.map(v => Object.freeze({
        fromId:  v.fromId,
        toId:    v.toId,
        drift:   v.drift,
        verdict: v.verdict,
      }))),
    }),
    passHistory: Object.freeze([...graph.passHistory]),
    compiledAt:  graph.compiledAt,
    projectId:   graph.projectId,
  });
}
