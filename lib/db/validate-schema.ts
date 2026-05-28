import { SCHEMA } from "./schema";
import { SCHEMA_VERSION } from "./schema.version";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Required tables and columns ────────────────────────────────────────────────

const REQUIRED: { table: string; columns: string[] }[] = [
  {
    table:   SCHEMA.renders.table,
    columns: Object.values(SCHEMA.renders.columns) as string[],
  },
  {
    table:   SCHEMA.credits.table,
    columns: Object.values(SCHEMA.credits.columns) as string[],
  },
  {
    table:   SCHEMA.profiles.table,
    columns: Object.values(SCHEMA.profiles.columns) as string[],
  },
];

// ── Main validator ─────────────────────────────────────────────────────────────

export async function validateSchema(db: SupabaseClient): Promise<void> {
  const failures: string[] = [];

  // ── Phase 1: column existence via information_schema ────────────────────────
  for (const { table, columns } of REQUIRED) {
    const { data, error } = await db
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", table);

    if (error) {
      failures.push(`${table}: metadata query failed — ${error.message}`);
      continue;
    }

    const actual = new Set((data ?? []).map((c: { column_name: string }) => c.column_name));
    for (const col of columns) {
      if (!actual.has(col)) {
        failures.push(`${table}.${col} missing`);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `[SCHEMA BREAK] DB schema mismatch — apply pending migrations:\n` +
      failures.map(f => `  • ${f}`).join("\n"),
    );
  }

  // ── Phase 2: version lock ────────────────────────────────────────────────────
  const { data: versionRows, error: versionError } = await db
    .from("schema_registry")
    .select("version")
    .order("applied_at", { ascending: false })
    .limit(1);

  // Failure mode A: table does not exist (Postgres 42P01)
  if (versionError) {
    const is42P01 =
      (versionError as unknown as { code?: string }).code === "42P01" ||
      versionError.message.includes("does not exist");

    if (is42P01) {
      throw new Error(
        `[SCHEMA REGISTRY MISSING] Table "schema_registry" does not exist in this Supabase project.\n` +
        `  → Run supabase/repair/schema_registry.sql in the Supabase SQL editor.\n` +
        `  → Or re-run supabase/setup.sql (fully idempotent).`,
      );
    }

    throw new Error(
      `[SCHEMA REGISTRY ERROR] Query failed: ${versionError.message}\n` +
      `  → Check RLS policies on schema_registry (run schema_registry_bootstrap.sql).`,
    );
  }

  // Failure mode B: table exists but is empty (seed was never applied)
  if (!versionRows || versionRows.length === 0) {
    throw new Error(
      `[SCHEMA BOOTSTRAP FAILURE] schema_registry exists but contains no rows.\n` +
      `  → Run: INSERT INTO schema_registry (version) VALUES ('${SCHEMA_VERSION}') ON CONFLICT DO NOTHING;`,
    );
  }

  // Failure mode C: version mismatch (migration applied but code not updated, or vice versa)
  const dbVersion = (versionRows as { version: string }[])[0].version;
  if (dbVersion !== SCHEMA_VERSION) {
    throw new Error(
      `[SCHEMA OUT OF SYNC] Expected version ${SCHEMA_VERSION}, DB has ${dbVersion}.\n` +
      `  → Apply pending migrations then:\n` +
      `     INSERT INTO schema_registry (version) VALUES ('${SCHEMA_VERSION}') ON CONFLICT DO NOTHING;`,
    );
  }
}
