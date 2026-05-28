/**
 * GET /api/admin/db-health
 *
 * Runs the full schema validation stack against the live DB and returns a
 * structured health report. Use this to diagnose bootstrap failures without
 * needing to run CLI scripts.
 *
 * Protected by ADMIN_SECRET header in production.
 * Unrestricted in development.
 *
 * Returns:
 *   { ok: true,  phase, version, tables }           on success
 *   { ok: false, phase, error, fix }                on failure
 *
 * Usage:
 *   curl http://localhost:3000/api/admin/db-health \
 *     -H "x-admin-secret: $ADMIN_SECRET"
 */

import { createClient } from "@supabase/supabase-js";
import { SCHEMA_VERSION } from "@/lib/db/schema.version";
import { SCHEMA } from "@/lib/db/schema";

const TABLES_REQUIRED = [
  SCHEMA.renders.table,
  SCHEMA.profiles.table,
  SCHEMA.credits.table,
  SCHEMA.brandProfiles.table,
  "schema_registry",
];

export async function GET(req: Request): Promise<Response> {
  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (process.env.NODE_ENV === "production") {
    const secret = req.headers.get("x-admin-secret");
    if (!secret || secret !== process.env.ADMIN_SECRET) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // ── Build service-role client (bypasses RLS for accurate diagnostics) ──────
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return Response.json(
      {
        ok:    false,
        phase: "env",
        error: "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing",
        fix:   "Add both variables to your .env.local and Vercel environment",
      },
      { status: 500 },
    );
  }

  const db = createClient(url, key);

  // ── Phase 1: check which tables exist ─────────────────────────────────────
  const { data: tableRows, error: tableError } = await db
    .from("information_schema.tables")
    .select("table_name")
    .eq("table_schema", "public");

  if (tableError) {
    return Response.json(
      {
        ok:    false,
        phase: "table_discovery",
        error: tableError.message,
        fix:   "Verify SUPABASE_SERVICE_ROLE_KEY is the service role key (not the anon key)",
      },
      { status: 500 },
    );
  }

  const existing = new Set((tableRows ?? []).map((r: { table_name: string }) => r.table_name));
  const missing  = TABLES_REQUIRED.filter(t => !existing.has(t));

  if (missing.length > 0) {
    return Response.json(
      {
        ok:      false,
        phase:   "table_existence",
        missing,
        error:   `Missing tables: ${missing.join(", ")}`,
        fix:     "Run supabase/setup.sql in the Supabase SQL editor (fully idempotent)",
        sql_url: "https://supabase.com/dashboard/project/wtzqjdlcvtjunujocbst/sql/new",
      },
      { status: 500 },
    );
  }

  // ── Phase 2: schema_registry version ──────────────────────────────────────
  const { data: versionRows, error: versionError } = await db
    .from("schema_registry")
    .select("version, applied_at")
    .order("applied_at", { ascending: false })
    .limit(1);

  if (versionError) {
    return Response.json(
      {
        ok:    false,
        phase: "schema_registry_query",
        error: versionError.message,
        code:  (versionError as unknown as { code?: string }).code,
        fix:   "Run supabase/repair/schema_registry.sql",
      },
      { status: 500 },
    );
  }

  if (!versionRows || versionRows.length === 0) {
    return Response.json(
      {
        ok:    false,
        phase: "schema_registry_seed",
        error: "schema_registry exists but is empty",
        fix:   `INSERT INTO schema_registry (version) VALUES ('${SCHEMA_VERSION}') ON CONFLICT DO NOTHING`,
      },
      { status: 500 },
    );
  }

  const dbVersion = (versionRows as { version: string; applied_at: string }[])[0];

  if (dbVersion.version !== SCHEMA_VERSION) {
    return Response.json(
      {
        ok:           false,
        phase:        "schema_version_mismatch",
        db_version:   dbVersion.version,
        code_version: SCHEMA_VERSION,
        error:        `Version mismatch: DB=${dbVersion.version}, code=${SCHEMA_VERSION}`,
        fix:          `INSERT INTO schema_registry (version) VALUES ('${SCHEMA_VERSION}') ON CONFLICT DO NOTHING`,
      },
      { status: 500 },
    );
  }

  // ── All checks passed ──────────────────────────────────────────────────────
  return Response.json({
    ok:         true,
    phase:      "all_checks_passed",
    version:    dbVersion.version,
    applied_at: dbVersion.applied_at,
    tables:     [...existing].sort(),
  });
}
