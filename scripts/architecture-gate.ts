/**
 * Omnyra Architecture Integrity Gate
 *
 * Fails the build (exit 1) if any forbidden execution pattern is found in
 * source files outside the explicitly-approved exceptions list.
 *
 * Single source of truth: /architecture/allowed-pipelines.json
 *
 * Run:
 *   npm run architecture-gate
 *
 * CI: this script runs before deployment. A non-zero exit blocks the deploy.
 */

import fs   from "fs";
import path from "path";

// ── Load manifest ──────────────────────────────────────────────────────────────

const ROOT          = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "architecture", "allowed-pipelines.json");

if (!fs.existsSync(MANIFEST_PATH)) {
  process.stderr.write(`[GATE] FATAL: manifest not found at ${MANIFEST_PATH}\n`);
  process.exit(2);
}

interface ExceptionEntry {
  id:        string;
  path:      string;
  reason:    string;
  owner:     string;
  createdAt: string;
  expiresAt: string | "never";
  risk?:     string;
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as {
  allowedPipelines: string[];
  allowedProviders: string[];
  forbiddenPatterns: string[];
  exceptions: {
    description: string;
    files: ExceptionEntry[];
  };
};

const FORBIDDEN: string[] = manifest.forbiddenPatterns;

const EXCEPTIONS: Map<string, string> = new Map(
  manifest.exceptions.files.map(e => [
    path.normalize(path.join(ROOT, e.path)),
    e.reason,
  ]),
);

// ── Exception expiry check ─────────────────────────────────────────────────────

const today = new Date();
today.setUTCHours(0, 0, 0, 0);

interface ExpiredDebt {
  id:        string;
  path:      string;
  owner:     string;
  expiresAt: string;
  reason:    string;
}

const expiredDebts: ExpiredDebt[] = [];

for (const entry of manifest.exceptions.files) {
  if (entry.expiresAt === "never") continue;
  const expiry = new Date(entry.expiresAt);
  expiry.setUTCHours(0, 0, 0, 0);
  if (expiry < today) {
    expiredDebts.push({
      id:        entry.id,
      path:      entry.path,
      owner:     entry.owner,
      expiresAt: entry.expiresAt,
      reason:    entry.reason,
    });
  }
}

if (expiredDebts.length > 0) {
  const HR2 = "═".repeat(58);
  process.stderr.write(`\n╔${HR2}╗\n`);
  process.stderr.write(`║  ARCHITECTURE DEBT: EXPIRED EXCEPTIONS                 ║\n`);
  process.stderr.write(`╚${HR2}╝\n\n`);
  process.stderr.write(`  Today: ${today.toISOString().slice(0, 10)}\n\n`);
  for (const d of expiredDebts) {
    process.stderr.write(`[ARCHITECTURE_DEBT]\n\n`);
    process.stderr.write(`  ID:       ${d.id}\n`);
    process.stderr.write(`  File:     ${d.path}\n`);
    process.stderr.write(`  Owner:    ${d.owner}\n`);
    process.stderr.write(`  Expired:  ${d.expiresAt}\n`);
    process.stderr.write(`  Reason:   ${d.reason}\n\n`);
  }
  process.stderr.write(`  ${expiredDebts.length} expired exception(s) — clean up debt or renew with justification.\n`);
  process.stderr.write(`  DEPLOYMENT BLOCKED\n`);
  process.stderr.write(`${HR2}\n\n`);
  process.exit(1);
}

// ── Violation types ────────────────────────────────────────────────────────────

interface ContentViolation {
  kind:    "content";
  file:    string;
  line:    number;
  pattern: string;
  excerpt: string;
}

const violations: ContentViolation[] = [];
let   scannedFiles   = 0;
let   skippedFiles   = 0;

// ── Directories to skip entirely ──────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  ".scripts-build",
  ".git",
  "coverage",
  ".vercel",
]);

function shouldSkipDir(dirName: string): boolean {
  return SKIP_DIRS.has(dirName);
}

// ── Scanner ────────────────────────────────────────────────────────────────────

function scan(dir: string): void {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (shouldSkipDir(entry)) continue;

    const full = path.join(dir, entry);
    let stat: fs.Stats;
    try { stat = fs.statSync(full); } catch { continue; }

    if (stat.isDirectory()) {
      scan(full);
      continue;
    }

    if (!/\.(ts|tsx|js|jsx)$/.test(full)) continue;

    const normalized = path.normalize(full);

    if (EXCEPTIONS.has(normalized)) {
      skippedFiles++;
      continue;
    }

    let content: string;
    try { content = fs.readFileSync(full, "utf8"); } catch { continue; }

    scannedFiles++;
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const lower = raw.toLowerCase();

      for (const pattern of FORBIDDEN) {
        if (lower.includes(pattern.toLowerCase())) {
          violations.push({
            kind:    "content",
            file:    path.relative(ROOT, full),
            line:    i + 1,
            pattern,
            excerpt: raw.trim().substring(0, 140),
          });
          break; // one violation per line — avoid duplicate reports
        }
      }
    }
  }
}

// ── Run ────────────────────────────────────────────────────────────────────────

scan(ROOT);

// ── Report ─────────────────────────────────────────────────────────────────────

const HR = "═".repeat(58);

if (violations.length === 0) {
  process.stdout.write(`\n╔${HR}╗\n`);
  process.stdout.write(`║  ARCHITECTURE GATE: PASSED                             ║\n`);
  process.stdout.write(`╚${HR}╝\n\n`);
  process.stdout.write(`  Scanned files  : ${scannedFiles}\n`);
  process.stdout.write(`  Excepted files : ${skippedFiles}\n`);
  process.stdout.write(`  Forbidden patterns : ${FORBIDDEN.length}\n`);
  process.stdout.write(`  Violations     : 0\n\n`);
  process.stdout.write(`  Only valid execution path:\n`);
  process.stdout.write(`  Director Core → Scene Planner → Provider Router → Execution Engine\n\n`);
  process.exit(0);
}

process.stderr.write(`\n╔${HR}╗\n`);
process.stderr.write(`║  ARCHITECTURE GATE: DEPLOYMENT BLOCKED                 ║\n`);
process.stderr.write(`╚${HR}╝\n\n`);
process.stderr.write(`  Reason: Architecture Integrity Violation\n\n`);

for (const v of violations) {
  process.stderr.write(`  ✗  ${v.file}:${v.line}  [forbidden: "${v.pattern}"]\n`);
  process.stderr.write(`     ${v.excerpt}\n\n`);
}

process.stderr.write(`${HR}\n`);
process.stderr.write(`  ${violations.length} violation(s) found.\n`);
process.stderr.write(`  Add an exception to architecture/allowed-pipelines.json\n`);
process.stderr.write(`  ONLY if the reference is a guard, tombstone, or manifest.\n`);
process.stderr.write(`  Every exception requires a written justification.\n\n`);
process.stderr.write(`  DEPLOYMENT REFUSED\n`);
process.stderr.write(`${HR}\n\n`);

process.exit(1);
