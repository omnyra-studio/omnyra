/**
 * Compiler-side schema registry.
 *
 * Single source of truth for which DB tables and columns the execution graph
 * is allowed to touch. DAG nodes declare their DB requirements against this
 * registry; validateDag() rejects any graph that references an undeclared
 * table or column key before a single query is issued.
 *
 * This is intentionally a thin re-export of lib/db/schema so the compiler
 * layer never reads raw column strings — it always goes through typed keys.
 */

import { SCHEMA } from "@/lib/db/schema";

export const schemaRegistry = {
  renders:      { table: SCHEMA.renders.table,      columns: SCHEMA.renders.columns      },
  profiles:     { table: SCHEMA.profiles.table,     columns: SCHEMA.profiles.columns     },
  credits:      { table: SCHEMA.credits.table,      columns: SCHEMA.credits.columns      },
  renderEvents: { table: SCHEMA.renderEvents.table, columns: SCHEMA.renderEvents.columns },
  usageLogs:    { table: SCHEMA.usageLogs.table,    columns: SCHEMA.usageLogs.columns    },
  brandProfiles:{ table: SCHEMA.brandProfiles.table,columns: SCHEMA.brandProfiles.columns},
} as const;

export type SchemaRegistryTable = keyof typeof schemaRegistry;

/** Returns the registry entry for a given physical table name, or undefined. */
export function getTableEntry(tableName: string) {
  return Object.values(schemaRegistry).find(e => e.table === tableName);
}
