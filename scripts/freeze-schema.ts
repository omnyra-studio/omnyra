/**
 * Schema freeze — writes artifacts/schema.json.
 *
 * Run before every build: npm run freeze-schema
 *
 * Queries information_schema to introspect actual DB column names,
 * verifies the schema_registry version matches SCHEMA_VERSION, and
 * writes a frozen artifact. The compiler reads ONLY this file — never
 * the live DB — making graph validation fully deterministic and offline.
 *
 * CI pipeline: freeze-schema → check-schema → build
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { SCHEMA } from "../lib/db/schema";
import { SCHEMA_VERSION } from "../lib/db/schema.version";
import type { SchemaArtifact } from "../lib/compiler/artifact/types";

const TABLES = [
  SCHEMA.renders.table,
  SCHEMA.profiles.table,
  SCHEMA.credits.table,
  SCHEMA.renderEvents.table,
  SCHEMA.usageLogs.table,
  SCHEMA.brandProfiles.table,
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("[freeze-schema] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const db = createClient(url, key);

  // ── Version lock check — three distinct failure modes ───────────────────────
  const { data: versionRows, error: versionError } = await db
    .from("schema_registry")
    .select("version")
    .order("applied_at", { ascending: false })
    .limit(1);

  if (versionError) {
    console.error(
      `[freeze-schema] SCHEMA REGISTRY ERROR — query failed: ${versionError.message}`,
      "\n  → Check RLS policies. Run: supabase/migrations/schema_registry_bootstrap.sql",
    );
    process.exit(1);
  }

  if (!versionRows || versionRows.length === 0) {
    console.error(
      `[freeze-schema] SCHEMA BOOTSTRAP FAILURE — schema_registry is empty`,
      `\n  → Run: INSERT INTO schema_registry (version) VALUES ('${SCHEMA_VERSION}')`,
    );
    process.exit(1);
  }

  const dbVersion = (versionRows as { version: string }[])[0].version;
  if (dbVersion !== SCHEMA_VERSION) {
    console.error(
      `[freeze-schema] SCHEMA OUT OF SYNC — code expects ${SCHEMA_VERSION}, DB has ${dbVersion}`,
      "\n  → Apply pending migrations and insert the new version into schema_registry",
    );
    process.exit(1);
  }

  // ── Introspect columns ───────────────────────────────────────────────────────
  const tables: SchemaArtifact["tables"] = {};

  for (const table of TABLES) {
    const { data, error } = await db
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", table);

    if (error) {
      console.error(`[freeze-schema] Failed to introspect ${table}: ${error.message}`);
      process.exit(1);
    }

    const columns = (data ?? [])
      .map((c: { column_name: string }) => c.column_name)
      .sort();

    tables[table] = { columns };
    console.log(`  ✓ ${table} — ${columns.length} columns`);
  }

  // ── Write artifact ───────────────────────────────────────────────────────────
  const artifact: SchemaArtifact = {
    version:     SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    tables,
  };

  const outDir = join(__dirname, "..", "artifacts");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "schema.json"), JSON.stringify(artifact, null, 2) + "\n", "utf8");

  console.log(`\n[freeze-schema] artifacts/schema.json written (version ${SCHEMA_VERSION})`);
  process.exit(0);
}

main();
