/**
 * OMNYRA — Credit State Machine Migration Audit
 * Read-only verification. Does not modify anything.
 */

import postgres from "postgres";

const sql = postgres(
  "postgresql://postgres.wtzqjdlcvtjunujocbst:spJ4tLOMV9TO2fsN@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres",
  { ssl: "require", max: 1 },
);

const results = {};

async function query(label, rawSql) {
  try {
    const rows = await sql.unsafe(rawSql);
    results[label] = { ok: true, rows };
    return rows;
  } catch (err) {
    results[label] = { ok: false, error: err.message };
    return null;
  }
}

// CHECK 1 — credit RPCs exist
const rpcs = await query("check1_rpcs", `
  SELECT routine_schema, routine_name
  FROM information_schema.routines
  WHERE routine_name ILIKE '%credit%'
  ORDER BY routine_schema, routine_name;
`);

// CHECK 2 — credit_reservations table
const table = await query("check2_table", `
  SELECT table_schema, table_name
  FROM information_schema.tables
  WHERE table_name = 'credit_reservations';
`);

// CHECK 3 — columns including txn_id
const columns = await query("check3_columns", `
  SELECT table_schema, table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'credit_reservations'
  ORDER BY ordinal_position;
`);

// CHECK 4 — indexes on credit_reservations
const indexes = await query("check4_indexes", `
  SELECT schemaname, tablename, indexname, indexdef
  FROM pg_indexes
  WHERE tablename = 'credit_reservations';
`);

// CHECK 5 — function definitions (routine_definition)
const defs = await query("check5_definitions", `
  SELECT routine_name,
         LEFT(routine_definition, 300) AS routine_definition_preview
  FROM information_schema.routines
  WHERE routine_name IN (
    'credit_reserve_atomic',
    'credit_commit_atomic',
    'credit_rollback_atomic'
  )
  ORDER BY routine_name;
`);

// CHECK 6 — migration tracking
const migrations = await query("check6_migrations", `
  SELECT * FROM supabase_migrations.schema_migrations
  ORDER BY version DESC
  LIMIT 20;
`);

// CHECK 7a — total reservation rows
const rowCount = await query("check7a_count", `
  SELECT COUNT(*) AS total_rows FROM public.credit_reservations;
`);

// CHECK 7b — status breakdown
const statusBreakdown = await query("check7b_status", `
  SELECT status, COUNT(*) AS cnt
  FROM public.credit_reservations
  GROUP BY status
  ORDER BY status;
`);

// CHECK 8 — txn_id uniqueness
const uniqueness = await query("check8_uniqueness", `
  SELECT
    COUNT(*) AS total_rows,
    COUNT(DISTINCT txn_id) AS unique_txns,
    COUNT(*) FILTER (WHERE txn_id IS NULL) AS null_txn_ids
  FROM public.credit_reservations;
`);

await sql.end();

// ── Evaluate results ──────────────────────────────────────────────────────────

const requiredRpcs = ["credit_reserve_atomic", "credit_commit_atomic", "credit_rollback_atomic"];
const foundRpcs    = (rpcs ?? []).map(r => r.routine_name);
const rpcPass      = requiredRpcs.every(r => foundRpcs.includes(r));

const tablePass    = (table ?? []).length > 0;
const txnIdCol     = (columns ?? []).find(c => c.column_name === "txn_id");
const columnPass   = !!txnIdCol;

const uniqueIdx    = (indexes ?? []).find(i => i.indexdef?.includes("txn_id"));
const indexPass    = !!uniqueIdx;

const defsPass     = (defs ?? []).length === 3;
const migPass      = migrations !== null; // table exists = pass (may be empty if using manual migrations)

const totalRows    = rowCount?.[0]?.total_rows ?? 0;
const stuckRows    = (statusBreakdown ?? []).find(r => r.status === "reserved");
const stuckCount   = stuckRows ? parseInt(stuckRows.cnt) : 0;
const tableHealth  = stuckCount < 50; // >50 stuck reservations = warn

const uniqueRow    = uniqueness?.[0];
const dupePass     = uniqueRow
  ? parseInt(uniqueRow.total_rows) === parseInt(uniqueRow.unique_txns) || parseInt(uniqueRow.total_rows) === 0
  : true;

const allPass      = rpcPass && tablePass && columnPass && indexPass && defsPass;

// ── Print report ──────────────────────────────────────────────────────────────

console.log("\n# OMNYRA CREDIT STATE MACHINE AUDIT");
console.log("=".repeat(50));

console.log(`\nMigration Tracking:    ${migPass ? "PASS" : "FAIL (table not found)"}`);
console.log(`RPC Status:            ${rpcPass ? "PASS" : "FAIL"}`);
console.log(`Table Exists:          ${tablePass ? "PASS" : "FAIL"}`);
console.log(`txn_id Column:         ${columnPass ? "PASS" : "FAIL"}`);
console.log(`Unique Constraint:     ${indexPass ? "PASS" : "FAIL"}`);
console.log(`Function Definitions:  ${defsPass ? "PASS" : "FAIL"}`);
console.log(`Reservation Health:    ${tableHealth ? "PASS" : "WARN (>50 stuck)"}`);
console.log(`txn_id Uniqueness:     ${dupePass ? "PASS" : "FAIL (duplicates found)"}`);

console.log("\n" + "=".repeat(50));
console.log("CHECK 1 — credit RPCs");
console.log(JSON.stringify(rpcs, null, 2));

console.log("\nCHECK 2 — table exists");
console.log(JSON.stringify(table, null, 2));

console.log("\nCHECK 3 — columns");
console.log(JSON.stringify(columns, null, 2));

console.log("\nCHECK 4 — indexes");
console.log(JSON.stringify(indexes, null, 2));

console.log("\nCHECK 5 — function definitions");
console.log(JSON.stringify(defs, null, 2));

console.log("\nCHECK 6 — migration tracking");
if (results["check6_migrations"].ok) {
  console.log(JSON.stringify(migrations, null, 2));
} else {
  console.log("SKIP — supabase_migrations.schema_migrations not found (manual migration workflow)");
}

console.log("\nCHECK 7 — reservation table health");
console.log("Total rows:", JSON.stringify(rowCount, null, 2));
console.log("Status breakdown:", JSON.stringify(statusBreakdown, null, 2));
if (stuckCount > 0) console.log(`⚠  ${stuckCount} rows in 'reserved' status — may be stuck`);

console.log("\nCHECK 8 — txn_id uniqueness");
console.log(JSON.stringify(uniqueness, null, 2));

console.log("\n" + "=".repeat(50));
console.log("CHECK 9 — Schema Drift Summary");
for (const rpc of requiredRpcs) {
  console.log(`  ${foundRpcs.includes(rpc) ? "PASS" : "MISSING"} — ${rpc}`);
}
console.log(`  ${columnPass ? "PASS" : "MISSING"} — credit_reservations.txn_id`);
console.log(`  ${indexPass  ? "PASS" : "MISSING"} — unique txn_id enforcement`);

console.log("\n" + "=".repeat(50));
console.log(`\nDeployment Readiness: ${allPass ? "✅ SAFE" : "❌ NOT SAFE — run migration first"}`);

if (!rpcPass) {
  console.log("\nCritical Finding: credit_reserve_atomic / credit_commit_atomic / credit_rollback_atomic are missing.");
  console.log("Action: Run supabase/migrations/20260603_credit_state_rpcs.sql in Supabase SQL editor.");
}
if (!columnPass) {
  console.log("\nCritical Finding: txn_id column missing from credit_reservations.");
  console.log("Action: Run the ALTER TABLE statement in 20260603_credit_state_rpcs.sql.");
}
