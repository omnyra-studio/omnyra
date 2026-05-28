/**
 * Deterministic Execution Engine — Layer 3 of FD-MECR.
 *
 * Every node execution is content-addressed:
 *   key = hash(nodeId + input + schemaVersion)
 *
 * Same key → cache hit → no re-execution.
 * Cache miss → validate input → compute → validate output → cache.
 *
 * executeGraph() runs a linear node sequence, threading outputs as inputs,
 * and produces an immutable ExecutionArtifact with a full node trace.
 *
 * This makes the execution graph a pure function of:
 *   (nodes, input, schemaVersion)
 * → identical inputs always produce identical artifacts.
 */

import { createHash } from "crypto";
import type { Node } from "./node";
import type { RuntimeContext } from "./runtime-context";
import type { ExecutionArtifact, NodeTrace } from "./artifact/types";
import { validateNodeInput, validateNodeOutput } from "./validate-node-io";
import { storeArtifact, getArtifact } from "./artifact-cache";

// ── Content-addressable hash ───────────────────────────────────────────────────

export function hashExecution(
  nodeId:        string,
  input:         unknown,
  schemaVersion: string,
): string {
  const canonical = JSON.stringify({ nodeId, input, schemaVersion });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

// ── Per-node execution cache (in-process) ─────────────────────────────────────

const nodeCache = new Map<string, unknown>();

// ── Single-node execution ──────────────────────────────────────────────────────

export async function executeNode<
  I extends Record<string, unknown>,
  O extends Record<string, unknown>,
>(
  node: Node<I, O>,
  input: I,
  ctx: RuntimeContext,
): Promise<{ output: O; hash: string; fromCache: boolean }> {
  const hash = hashExecution(node.id, input, ctx.schema.version);

  const cached = nodeCache.get(hash);
  if (cached !== undefined) {
    return { output: cached as O, hash, fromCache: true };
  }

  validateNodeInput(node.id, input, node.inputs as Record<string, string>);

  const output = await node.compute(input, ctx);

  validateNodeOutput(node.id, output, node.outputs as Record<string, string>);

  nodeCache.set(hash, output);
  return { output, hash, fromCache: false };
}

// ── Graph execution ────────────────────────────────────────────────────────────

export async function executeGraph(
  nodes:        readonly Node[],
  initialInput: Record<string, unknown>,
  ctx:          RuntimeContext,
): Promise<ExecutionArtifact> {
  const graphHash = hashExecution(
    "__graph__",
    { nodeIds: nodes.map(n => n.id), input: initialInput },
    ctx.schema.version,
  );

  // Full graph cache hit — identical execution replay
  const existingArtifact = getArtifact(graphHash);
  if (existingArtifact) {
    return existingArtifact;
  }

  const nodeTrace: NodeTrace[] = [];
  let current: Record<string, unknown> = initialInput;

  for (const node of nodes) {
    const { output, hash } = await executeNode(node, current, ctx);
    nodeTrace.push({
      nodeId:     node.id,
      input:      current,
      output,
      hash,
      executedAt: new Date().toISOString(),
    });
    current = output as Record<string, unknown>;
  }

  const artifact: ExecutionArtifact = Object.freeze({
    graphHash,
    schemaVersion: ctx.schema.version,
    inputs:        initialInput,
    outputs:       current,
    nodeTrace,
    createdAt:     new Date().toISOString(),
  });

  storeArtifact(artifact);
  return artifact;
}
