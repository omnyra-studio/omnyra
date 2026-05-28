/**
 * DAG pre-execution validator — Layer 2 gate (combined).
 *
 * Runs two independent validation passes BEFORE any node executes:
 *
 *   Pass 1 — Schema contract (validateDag):
 *     Every node that declares db.table must reference a table present in the
 *     frozen SchemaArtifact. Every column in db.requires must exist in that
 *     table's frozen column list.
 *
 *   Pass 2 — Pipeline causality (validatePipeline):
 *     Cycle detection, source-node purity, derived-node grounding, and
 *     ancestor-based causality direction enforcement. A node may only consume
 *     a field produced by another node if that producer is a declared ancestor
 *     (transitive dependsOn) of the consumer. This permanently prevents the
 *     class of bug where a downstream artifact (e.g. hookId) is required as an
 *     upstream input to the node that produces its prerequisite.
 *
 * The artifact is authoritative for schema checks; the live DB is never
 * consulted here. The pipeline graph itself is authoritative for causality.
 *
 * Usage:
 *   validateGraph(nodes, loadSchemaArtifact());  // throws on any violation
 *
 * Individual passes are also exported for targeted use:
 *   validateDag(schemaNodes, schema);
 *   validatePipeline(pipelineNodes);
 */

import type { SchemaArtifact }   from "./artifact/types";
import { validatePipeline }      from "./validate-pipeline";
import type { PipelineNodeContract } from "./validate-pipeline";

export type { PipelineNodeContract };
export { validatePipeline };

export interface DAGNodeContract {
  readonly id:      string;
  readonly db?: {
    readonly table:    string;
    readonly requires?: readonly string[];
  };
  readonly inputs?:  Record<string, string>;
  readonly outputs?: Record<string, string>;
}

export class DAGValidationError extends Error {
  constructor(
    public readonly nodeId: string,
    public readonly reason: string,
  ) {
    super(`[DAG INVALID] Node "${nodeId}": ${reason}`);
    this.name = "DAGValidationError";
  }
}

export function validateDag(
  nodes:  readonly DAGNodeContract[],
  schema: SchemaArtifact,
): true {
  for (const node of nodes) {
    if (!node.db) continue;

    const tableEntry = schema.tables[node.db.table];
    if (!tableEntry) {
      throw new DAGValidationError(
        node.id,
        `references table "${node.db.table}" which is not in schema artifact (version ${schema.version})`,
      );
    }

    const actualCols = new Set(tableEntry.columns);
    for (const col of node.db.requires ?? []) {
      if (!actualCols.has(col)) {
        throw new DAGValidationError(
          node.id,
          `requires column "${col}" which does not exist in artifact for table "${node.db.table}"`,
        );
      }
    }
  }

  return true;
}

/**
 * Combined gate: runs schema validation then pipeline causality validation.
 * Nodes must satisfy both DAGNodeContract and PipelineNodeContract.
 */
export function validateGraph(
  nodes:  readonly (DAGNodeContract & PipelineNodeContract)[],
  schema: SchemaArtifact,
): true {
  validateDag(nodes, schema);
  validatePipeline(nodes);
  return true;
}
