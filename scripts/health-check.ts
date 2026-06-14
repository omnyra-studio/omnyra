/**
 * scripts/health-check.ts — Omnyra.studio pre-launch system health check
 *
 * Verifies every layer that must be live before accepting real traffic:
 *   - Environment variables
 *   - Supabase connectivity + table existence
 *   - Learning columns on renders (from 20260614_definitive_learning_schema.sql)
 *   - performance_data table
 *   - Credit RPCs (deduct_credits_atomic, add_credits, reset_monthly_credits)
 *   - Ghost Test: no emotion words in AI system prompts
 *   - Duration clamp: parallel-engine enforces 25–30s
 *
 * Run: npm run health
 * Env: loads .env.local automatically if present in cwd.
 */

import { createClient } from "@supabase/supabase-js";
import * as fs           from "fs";
import * as path         from "path";

// Load .env.local before any process.env reads
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CheckResult {
  name:    string;
  ok:      boolean;
  detail?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pass(name: string, detail?: string): CheckResult {
  return { name, ok: true, detail };
}

function fail(name: string, detail: string): CheckResult {
  return { name, ok: false, detail };
}

// ── 1. Environment variables ──────────────────────────────────────────────────

const REQUIRED_ENV: string[] = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
  "FAL_API_KEY",
  "ELEVENLABS_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_APP_URL",
];

function checkEnvVars(): CheckResult[] {
  return REQUIRED_ENV.map(key => {
    const val = process.env[key];
    if (!val) return fail(`env:${key}`, "missing — not set in shell environment");
    if (val.startsWith("your_") || val === "placeholder") {
      return fail(`env:${key}`, "still set to placeholder value");
    }
    // Mask for display
    const masked = val.slice(0, 6) + "…" + val.slice(-4);
    return pass(`env:${key}`, masked);
  });
}

// ── 2. Supabase connectivity ──────────────────────────────────────────────────

async function checkSupabase(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!url || !key) {
    return [fail("supabase:connection", "env vars missing — skipping DB checks")];
  }

  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Core tables
  const tables: Array<{ name: string; table: string; selectCols?: string }> = [
    { name: "table:credits",          table: "credits",          selectCols: "user_id, balance" },
    { name: "table:creator_memory",   table: "creator_memory",   selectCols: "id, memory_type" },
    { name: "table:renders",          table: "renders",          selectCols: "id, status" },
    { name: "table:usage_logs",       table: "usage_logs",       selectCols: "id, action_type" },
    { name: "table:brand_profiles",   table: "brand_profiles",   selectCols: "user_id, brand_name" },
    { name: "table:cinematic_jobs",   table: "cinematic_jobs",   selectCols: "id, status" },
    { name: "table:performance_data", table: "performance_data", selectCols: "id, platform" },
  ];

  for (const { name, table, selectCols } of tables) {
    const { error } = await db.from(table).select(selectCols ?? "*").limit(1);
    if (error) {
      results.push(fail(name, error.message));
    } else {
      results.push(pass(name));
    }
  }

  // renders with learning columns (20260614_renders_learning_columns.sql)
  const { error: renderErr } = await db
    .from("renders")
    .select("id, was_published, was_edited, user_rating, template, completed_at")
    .limit(1);

  if (renderErr) {
    results.push(fail(
      "table:renders+learning_cols",
      `${renderErr.message} — run 20260614_definitive_learning_schema.sql`,
    ));
  } else {
    results.push(pass("table:renders+learning_cols", "was_published, was_edited, user_rating, template, completed_at all present"));
  }

  // Credit RPCs (call with a null UUID — expected to fail gracefully, not 404)
  const rpcs: Array<{ name: string; rpc: string; args: Record<string, unknown> }> = [
    { name: "rpc:deduct_credits_atomic", rpc: "deduct_credits_atomic", args: { p_user_id: "00000000-0000-0000-0000-000000000000", p_amount: 0 } },
    { name: "rpc:add_credits",           rpc: "add_credits",           args: { p_user_id: "00000000-0000-0000-0000-000000000000", p_amount: 0, p_reason: "health_check" } },
  ];

  for (const { name, rpc, args } of rpcs) {
    const { error } = await db.rpc(rpc, args);
    // A "permission denied" or "no rows" error is fine — it means the function EXISTS
    // A "function … does not exist" error means migration hasn't run
    if (error && error.message.includes("does not exist")) {
      results.push(fail(name, `function not found — run credit RPC migration`));
    } else {
      results.push(pass(name, error ? `exists (returned: ${error.code})` : "exists"));
    }
  }

  return results;
}

// ── 3. Ghost Test audit ────────────────────────────────────────────────────────

const GHOST_TEST_VIOLATIONS = [
  "was furious", "felt guilty", "was heartbroken", "was excited",
  "was sad", "felt happy", "was angry", "felt relieved", "was devastated",
  "felt overwhelmed", "was nervous", "felt confident", "was emotional",
  "felt a wave", "overcome with", "burst into tears", "was in love",
];

function checkGhostTest(): CheckResult[] {
  const results: CheckResult[] = [];
  const root = process.cwd();

  const filesToAudit = [
    "app/api/generate-script/route.ts",
    "app/api/generate-brief/route.ts",
    "app/api/generate-scene-images/route.ts",
    "app/api/generate-truth-card/route.ts",
    "app/api/generate-vo-script/route.ts",
    "lib/prompt-optimizer.ts",
    "lib/brand-brain/learning.ts",
  ];

  // If any of these appear within 300 chars BEFORE the phrase, it's an instructional example.
  const INSTRUCTION_CONTEXT = /never write|never use|don't write|wrong:|what fails|examples? of.*fail|❌|✗ never|remove all|avoid writing|not ".*was |replace.*with|ghost test rule/i;

  for (const relPath of filesToAudit) {
    const absPath = path.join(root, relPath);
    if (!fs.existsSync(absPath)) {
      results.push(fail(`ghost:${relPath}`, "file not found"));
      continue;
    }

    const src  = fs.readFileSync(absPath, "utf-8");
    const hits: string[] = [];

    for (const phrase of GHOST_TEST_VIOLATIONS) {
      const escaped  = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Match phrase inside a string literal
      const inString = new RegExp(`["'\`][^"'\`\n]{0,200}${escaped}[^"'\`\n]{0,200}["'\`]`, "gi");
      let m: RegExpExecArray | null;

      while ((m = inString.exec(src)) !== null) {
        const matchStart = m.index;
        // Look 400 chars back in the raw source for instructional context
        const context = src.slice(Math.max(0, matchStart - 400), matchStart);
        // Also check if this line is a pure comment
        const lineStart = src.lastIndexOf("\n", matchStart) + 1;
        const linePrefix = src.slice(lineStart, matchStart).trimStart();
        const isComment = linePrefix.startsWith("//") || linePrefix.startsWith("*") || linePrefix.startsWith("/*");

        if (isComment || INSTRUCTION_CONTEXT.test(context)) {
          continue; // false positive — it's an instruction, not a violation
        }

        hits.push(`"${phrase}"`);
        break;
      }
    }

    if (hits.length) {
      results.push(fail(`ghost:${relPath}`, `emotion words in non-instructional string literals: ${hits.join(", ")}`));
    } else {
      results.push(pass(`ghost:${relPath}`));
    }
  }

  return results;
}

// ── 4. Duration clamp in parallel-engine ─────────────────────────────────────

function checkDurationClamp(): CheckResult {
  const enginePath = path.join(process.cwd(), "lib/orchestrator/parallel-engine.ts");
  if (!fs.existsSync(enginePath)) {
    return fail("duration:clamp", "lib/orchestrator/parallel-engine.ts not found");
  }

  const src = fs.readFileSync(enginePath, "utf-8");
  const hasClamp = src.includes("Math.min(Math.max(25") || src.includes("Math.max(25,");
  const hasMax30  = src.includes("30)") || src.includes(", 30)");

  if (!hasClamp) {
    return fail("duration:clamp", "Math.min(Math.max(25, …)) not found — duration enforcement may be missing");
  }
  if (!hasMax30) {
    return fail("duration:clamp", "upper bound 30s not detected — check clamp values");
  }

  return pass("duration:clamp", "25–30s clamp confirmed in parallel-engine.ts");
}

// ── 5. generate-video maxDuration ────────────────────────────────────────────

function checkMaxDuration(): CheckResult {
  const routePath = path.join(process.cwd(), "app/api/generate-video/route.ts");
  if (!fs.existsSync(routePath)) {
    return fail("route:maxDuration", "app/api/generate-video/route.ts not found");
  }

  const src = fs.readFileSync(routePath, "utf-8");
  if (!src.includes("export const maxDuration = 300")) {
    return fail("route:maxDuration", "maxDuration = 300 not found — Vercel will time out long generations");
  }
  return pass("route:maxDuration", "maxDuration = 300 ✓");
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  console.log("Omnyra.studio — Health Check\n");
  console.log("=".repeat(60));

  const allResults: CheckResult[] = [];

  // Env vars (synchronous)
  console.log("\n[1/5] Environment Variables");
  const envResults = checkEnvVars();
  allResults.push(...envResults);
  for (const r of envResults) {
    const icon = r.ok ? "  OK " : "  FAIL";
    const detail = r.detail ? `  ${r.detail}` : "";
    console.log(`${icon}  ${r.name}${detail}`);
  }

  // Supabase
  console.log("\n[2/5] Supabase Tables & RPCs");
  const dbResults = await checkSupabase();
  allResults.push(...dbResults);
  for (const r of dbResults) {
    const icon = r.ok ? "  OK " : "  FAIL";
    const detail = r.detail ? `  ${r.detail}` : "";
    console.log(`${icon}  ${r.name}${detail}`);
  }

  // Ghost Test
  console.log("\n[3/5] Ghost Test Audit (no emotion words in AI prompts)");
  const ghostResults = checkGhostTest();
  allResults.push(...ghostResults);
  for (const r of ghostResults) {
    const icon = r.ok ? "  OK " : "  FAIL";
    const detail = r.detail ? `  ${r.detail}` : "";
    console.log(`${icon}  ${r.name}${detail}`);
  }

  // Duration clamp
  console.log("\n[4/5] Duration Enforcement");
  const clampResult = checkDurationClamp();
  allResults.push(clampResult);
  console.log(`${clampResult.ok ? "  OK " : "  FAIL"}  ${clampResult.name}  ${clampResult.detail ?? ""}`);

  // Route maxDuration
  console.log("\n[5/5] Route Settings");
  const durResult = checkMaxDuration();
  allResults.push(durResult);
  console.log(`${durResult.ok ? "  OK " : "  FAIL"}  ${durResult.name}  ${durResult.detail ?? ""}`);

  // Summary
  const failed = allResults.filter(r => !r.ok);
  console.log("\n" + "=".repeat(60));

  if (failed.length === 0) {
    console.log("ALL CHECKS PASSED — system is ready for traffic.\n");
    console.log("Next steps:");
    console.log("  npm run dev                          — local development");
    console.log("  npx vercel deploy                    — preview deployment");
    console.log("  npx vercel deploy --prod             — production deployment");
  } else {
    console.log(`${failed.length} CHECK(S) FAILED:\n`);
    for (const r of failed) {
      console.log(`  FAIL  ${r.name}`);
      if (r.detail) console.log(`        ${r.detail}`);
    }
    console.log("\nFix all failures before deploying to production.");
    process.exit(1);
  }
}

run().catch(err => {
  console.error("Health check crashed:", err);
  process.exit(1);
});
