/**
 * Temporary migration runner — applies all 20260614 migrations in dependency order.
 * Run once: node scripts/run-migrations.js
 */
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const CONNECTION_STRING =
  "postgresql://postgres.wtzqjdlcvtjunujocbst:spJ4tLOMV9TO2fsN@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres";

// Ordered by dependency — schema_reference creates the tables that billing_rls policies reference
const MIGRATIONS = [
  "20260614_schema_reference.sql",           // core tables: credits, credit_transactions, etc.
  "20260614_billing_rls.sql",                // RLS + deduct_credits_atomic / add_credits RPCs
  "20260614_definitive_learning_schema.sql", // renders outcome cols + performance_data (correct FK)
  "20260614_brand_profiles_style_preset.sql",// brand_profiles.style_preset column
  "20260614_renders_youtube_columns.sql",    // renders.uploaded_to_youtube / youtube_video_id
  // 20260614_renders_learning_columns.sql is superseded by definitive_learning_schema.sql — skipped
];

async function run() {
  const client = new Client({
    connectionString: CONNECTION_STRING,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    console.log("Connecting to Supabase Postgres...");
    await client.connect();
    console.log("Connected.\n");

    for (const filename of MIGRATIONS) {
      const filepath = path.join(__dirname, "..", "supabase", "migrations", filename);
      const sql = fs.readFileSync(filepath, "utf-8");

      process.stdout.write(`  Running ${filename}... `);
      try {
        await client.query(sql);
        console.log("OK");
      } catch (err) {
        console.log("FAILED");
        console.error(`    Error: ${err.message}`);
        // Continue with remaining migrations even if one fails (idempotency errors are common)
        if (err.message.includes("already exists") || err.message.includes("does not exist")) {
          console.log("    (likely already applied — continuing)");
        } else {
          console.log("    !!! Non-idempotency error — check SQL above");
        }
      }
    }

    console.log("\nAll migrations attempted.");

    // Quick verification
    console.log("\nVerification:");
    const cols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'renders'
        AND column_name IN ('was_published','was_edited','user_rating','template','completed_at','uploaded_to_youtube','youtube_video_id','updated_at')
      ORDER BY column_name;
    `);
    console.log("  renders columns added:", cols.rows.map(r => r.column_name).join(", "));

    const pd = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'performance_data'
      ORDER BY column_name;
    `);
    console.log("  performance_data columns:", pd.rows.map(r => r.column_name).join(", ") || "(table missing)");

    const bp = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'brand_profiles' AND column_name = 'style_preset';
    `);
    console.log("  brand_profiles.style_preset:", bp.rows.length ? "present" : "MISSING");

    const rpcs = await client.query(`
      SELECT routine_name FROM information_schema.routines
      WHERE routine_name IN ('deduct_credits_atomic','add_credits','reset_monthly_credits')
      ORDER BY routine_name;
    `);
    console.log("  RPCs:", rpcs.rows.map(r => r.routine_name).join(", ") || "(none found)");

  } finally {
    await client.end();
  }
}

run().catch(err => {
  console.error("Migration runner crashed:", err.message);
  process.exit(1);
});
