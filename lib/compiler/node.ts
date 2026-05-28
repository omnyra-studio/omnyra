/**
 * Node contract type — the atomic unit of the DAG compiler.
 *
 * Nodes are PURE DECLARATIONS. They do not execute queries at definition time.
 * Every field is a compile-time contract that validateDag() and the execution
 * engine enforce before any compute function is called.
 *
 * `db.table` must be a key in SchemaArtifact.tables.
 * `db.requires` lists physical column names that must exist in the artifact
 *   for that table. Use SCHEMA.xxx.columns.yyy to avoid raw strings.
 */

import type { RuntimeContext } from "./runtime-context";

export type FieldType = "string" | "number" | "boolean" | "object" | "array" | "null";

export interface Node<
  I extends Record<string, unknown> = Record<string, unknown>,
  O extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id:      string;
  readonly inputs:  Record<string & keyof I, FieldType>;
  readonly outputs: Record<string & keyof O, FieldType>;
  readonly db?: {
    readonly table:    string;       // must match a key in SchemaArtifact.tables
    readonly requires: string[];     // physical column names — use SCHEMA.xxx.columns.yyy
  };
  readonly compute: (input: I, ctx: RuntimeContext) => Promise<O> | O;
}
