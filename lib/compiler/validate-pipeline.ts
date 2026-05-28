/**
 * Pipeline Direction Enforcement Layer — Layer 2b gate.
 *
 * Extends the schema-level DAG validation with causality direction enforcement.
 * Runs entirely at compile time — no DB, no schema artifact required.
 *
 * Node roles:
 *   "source"    — entry points; consume only user-provided IDs (userId, projectId)
 *                 CANNOT consume fields produced by any other node
 *   "derived"   — produce downstream artifacts (hooks, briefs, scripts)
 *                 their output fields CANNOT be inputs to source nodes
 *   "transform" — general processing; may consume any previously-produced field
 *
 * Checks performed:
 *   1. Cycle detection via topological sort on `dependsOn` edges
 *   2. Unknown dependency references (dependsOn names a node not in the graph)
 *   3. Causality direction: a node cannot consume a field produced by a node
 *      that is later in topological order (inverted causality)
 *   4. Source-node purity: source nodes cannot consume derived fields
 *   5. Derived-node grounding: derived nodes must declare at least one dependency
 *
 * This layer permanently prevents the class of bug where a downstream artifact
 * (e.g. hookId) was required as an upstream input to the node that produces
 * its prerequisite (e.g. generate-script). The compiler rejects it before
 * any request is made.
 *
 * Usage:
 *   validatePipeline(nodes);  // throws on violation, returns true on success
 *
 * To enforce both schema and causality together:
 *   validateDag(nodes, schema);
 *   validatePipeline(nodes);
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type NodeRole = "source" | "derived" | "transform";

export interface PipelineNodeContract {
  readonly id:          string;
  readonly role:        NodeRole;
  /** Field names this node consumes as inputs. */
  readonly inputs?:     readonly string[];
  /** Field names this node produces as outputs. */
  readonly outputs?:    readonly string[];
  /** IDs of nodes this node depends on (defines execution ordering). */
  readonly dependsOn?:  readonly string[];
}

// ── Error types ────────────────────────────────────────────────────────────────

export class CausalityViolationError extends Error {
  constructor(
    public readonly consumingNodeId: string,
    public readonly producingNodeId: string,
    public readonly fieldName:       string,
  ) {
    super(
      `[CAUSALITY VIOLATION] Node "${consumingNodeId}" requires field "${fieldName}" ` +
      `which is produced by node "${producingNodeId}" — a node that comes AFTER it in the pipeline. ` +
      `Derived outputs cannot be upstream inputs. ` +
      `Fix: either move "${consumingNodeId}" downstream of "${producingNodeId}", ` +
      `or remove "${fieldName}" from "${consumingNodeId}"'s inputs.`,
    );
    this.name = "CausalityViolationError";
  }
}

export class PipelineCycleError extends Error {
  constructor(public readonly participatingNodes: string[]) {
    super(
      `[PIPELINE CYCLE] Dependency cycle detected among nodes: ${participatingNodes.join(", ")}. ` +
      `A DAG cannot have cycles — review the dependsOn declarations for these nodes.`,
    );
    this.name = "PipelineCycleError";
  }
}

export class UnknownDependencyError extends Error {
  constructor(
    public readonly nodeId: string,
    public readonly unknownDepId: string,
  ) {
    super(
      `[UNKNOWN DEPENDENCY] Node "${nodeId}" depends on "${unknownDepId}" ` +
      `which is not declared in the pipeline graph.`,
    );
    this.name = "UnknownDependencyError";
  }
}

export class SourcePurityError extends Error {
  constructor(
    public readonly sourceNodeId:    string,
    public readonly producingNodeId: string,
    public readonly fieldName:       string,
  ) {
    super(
      `[SOURCE PURITY VIOLATION] Source node "${sourceNodeId}" requires field "${fieldName}" ` +
      `which is produced by node "${producingNodeId}". ` +
      `Source nodes may only consume external inputs (user-provided IDs, request parameters). ` +
      `Remove "${fieldName}" from "${sourceNodeId}"'s inputs, or change its role to "transform".`,
    );
    this.name = "SourcePurityError";
  }
}

export class DerivedNodeGroundingError extends Error {
  constructor(public readonly nodeId: string) {
    super(
      `[DERIVED GROUNDING VIOLATION] Derived node "${nodeId}" declares no dependencies (dependsOn is empty). ` +
      `Derived nodes must depend on at least one upstream node — they exist to transform prior outputs.`,
    );
    this.name = "DerivedNodeGroundingError";
  }
}

// ── Topological sort ───────────────────────────────────────────────────────────

function topoSort(nodes: readonly PipelineNodeContract[]): string[] {
  const nodeIds  = new Set(nodes.map(n => n.id));
  const inDegree = new Map<string, number>(nodes.map(n => [n.id, 0]));
  const adj      = new Map<string, string[]>(nodes.map(n => [n.id, []]));

  for (const n of nodes) {
    for (const dep of n.dependsOn ?? []) {
      if (!nodeIds.has(dep)) throw new UnknownDependencyError(n.id, dep);
      adj.get(dep)!.push(n.id);
      inDegree.set(n.id, (inDegree.get(n.id) ?? 0) + 1);
    }
  }

  const queue  = nodes.filter(n => (inDegree.get(n.id) ?? 0) === 0).map(n => n.id);
  const sorted: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    for (const dependent of adj.get(current) ?? []) {
      const newDeg = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, newDeg);
      if (newDeg === 0) queue.push(dependent);
    }
  }

  if (sorted.length !== nodes.length) {
    const inCycle = nodes.filter(n => !sorted.includes(n.id)).map(n => n.id);
    throw new PipelineCycleError(inCycle);
  }

  return sorted;
}

// ── Ancestor reachability ──────────────────────────────────────────────────────
// For each node, compute the full set of ancestor node IDs (transitive dependsOn).
// "ancestor" means: there exists a path from ancestor → node through dependsOn edges.
// This determines the guaranteed execution-before relationship.

function computeAncestors(
  nodes: readonly PipelineNodeContract[],
): Map<string, Set<string>> {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const memo    = new Map<string, Set<string>>();

  function ancestorsOf(id: string): Set<string> {
    if (memo.has(id)) return memo.get(id)!;
    const result  = new Set<string>();
    const node    = nodeMap.get(id);
    for (const dep of node?.dependsOn ?? []) {
      result.add(dep);
      for (const a of ancestorsOf(dep)) result.add(a);
    }
    memo.set(id, result);
    return result;
  }

  for (const n of nodes) ancestorsOf(n.id);
  return memo;
}

// ── Causality validation ───────────────────────────────────────────────────────

function validateCausality(
  nodes: readonly PipelineNodeContract[],
): void {
  // Map: fieldName → producing node
  const fieldProducer = new Map<string, { id: string; role: NodeRole }>();
  for (const n of nodes) {
    for (const field of n.outputs ?? []) {
      fieldProducer.set(field, { id: n.id, role: n.role });
    }
  }

  // Ancestors: guaranteed-before relationship (transitive dependsOn)
  const ancestors = computeAncestors(nodes);

  for (const n of nodes) {
    // Rule 1: derived nodes must have at least one dependency
    if (n.role === "derived" && (n.dependsOn ?? []).length === 0) {
      throw new DerivedNodeGroundingError(n.id);
    }

    for (const inputField of n.inputs ?? []) {
      const producer = fieldProducer.get(inputField);
      if (producer === undefined) continue; // external input — no constraint

      // Rule 2: source-node purity — source nodes cannot consume any pipeline-produced field
      if (n.role === "source") {
        throw new SourcePurityError(n.id, producer.id, inputField);
      }

      // Rule 3: causality direction — producer must be a declared ancestor of consumer.
      // Positional topo-order is not sufficient: two nodes with no dependency between them
      // can appear in either order, making positional checks non-deterministic. Ancestor
      // reachability is the correct check: producer must be upstream of consumer via a
      // declared dependsOn path, guaranteeing execution order regardless of topo tie-breaking.
      if (!ancestors.get(n.id)?.has(producer.id)) {
        throw new CausalityViolationError(n.id, producer.id, inputField);
      }
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Validates pipeline causality and dependency ordering.
 *
 * Throws one of:
 *   PipelineCycleError         — cycle in dependsOn graph
 *   UnknownDependencyError     — dependsOn references a non-existent node
 *   DerivedNodeGroundingError  — derived node has no dependencies
 *   SourcePurityError          — source node consumes pipeline-produced field
 *   CausalityViolationError    — node consumes field produced by a later node
 *
 * Returns `true` on success.
 */
export function validatePipeline(nodes: readonly PipelineNodeContract[]): true {
  topoSort(nodes);            // cycle + unknown-dependency detection
  validateCausality(nodes);   // ancestor-based causality enforcement
  return true;
}

/**
 * Returns the topological execution order for a validated pipeline.
 * Throws the same errors as validatePipeline if the graph is invalid.
 */
export function pipelineTopoOrder(nodes: readonly PipelineNodeContract[]): string[] {
  const order = topoSort(nodes);
  validateCausality(nodes);
  return order;
}
