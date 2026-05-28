/**
 * CI schema guard — fails the build if required DB columns are missing or the
 * schema version is out of sync.
 *
 * Usage:  npx ts-node scripts/check-schema.ts
 * Add to package.json:  "check-schema": "ts-node scripts/check-schema.ts"
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
 * Uses service-role key so RLS does not block information_schema access.
 */

import { createClient } from "@supabase/supabase-js";
import { SCHEMA } from "../lib/db/schema";
import { SCHEMA_VERSION } from "../lib/db/schema.version";

const REQUIRED: { table: string; columns: string[] }[] = [
  { table: SCHEMA.renders.table,      columns: Object.values(SCHEMA.renders.columns) as string[]      },
  { table: SCHEMA.profiles.table,     columns: Object.values(SCHEMA.profiles.columns) as string[]     },
  { table: SCHEMA.credits.table,      columns: Object.values(SCHEMA.credits.columns) as string[]      },
  { table: SCHEMA.brandProfiles.table, columns: Object.values(SCHEMA.brandProfiles.columns) as string[] },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("[check-schema] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const db = createClient(url, key);
  const failures: string[] = [];

  // Phase 1: introspect actual schema via information_schema
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
    console.error("[check-schema] SCHEMA BREAK — apply pending migrations:");
    for (const f of failures) console.error(`  • ${f}`);
    process.exit(1);
  }

  // Phase 2: version lock — three distinct failure modes, no silent fallback
  const { data: versionRows, error: versionError } = await db
    .from("schema_registry")
    .select("version")
    .order("applied_at", { ascending: false })
    .limit(1);

  if (versionError) {
    console.error(
      `[check-schema] SCHEMA REGISTRY ERROR — query failed: ${versionError.message}`,
      "\n  → Check RLS policies. Run: supabase/migrations/schema_registry_bootstrap.sql",
    );
    process.exit(1);
  }

  if (!versionRows || versionRows.length === 0) {
    console.error(
      `[check-schema] SCHEMA BOOTSTRAP FAILURE — schema_registry is empty`,
      `\n  → Run: INSERT INTO schema_registry (version) VALUES ('${SCHEMA_VERSION}')`,
    );
    process.exit(1);
  }

  const dbVersion = (versionRows as { version: string }[])[0].version;
  if (dbVersion !== SCHEMA_VERSION) {
    console.error(
      `[check-schema] SCHEMA OUT OF SYNC — expected ${SCHEMA_VERSION}, DB has ${dbVersion}`,
      "\n  → Apply pending migrations and insert the new version into schema_registry",
    );
    process.exit(1);
  }

  console.log(`[check-schema] OK — all columns verified, schema version ${SCHEMA_VERSION} confirmed.`);
  process.exit(0);
}

main();
