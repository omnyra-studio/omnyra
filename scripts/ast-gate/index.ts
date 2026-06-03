/**
 * Omnyra AST-Level Architecture Gate v2
 *
 * Performs structural analysis of source files using regex-based AST simulation.
 * Enforces: import graph rules, hook discipline, model call placement.
 *
 * Run: npm run ast-gate
 * CI: runs after architecture-gate (Layer 3 enforcement)
 */

import fs from "fs";
import path from "path";
import { importGraphRules } from "./rules/architecture.rules";
import { reactHookRules } from "./rules/react.rules";
import { analyzeImportGraph } from "./analyzers/importGraph";
import { analyzeHooks } from "./analyzers/hookAnalyzer";
import { analyzeModelCalls } from "./analyzers/modelCallAnalyzer";

const ROOT = process.cwd();

interface GateViolation {
  file: string;
  rule: string;
  severity: "error" | "warning";
  detail: string;
  line?: number;
}

function collectSourceFiles(dir: string, exts: string[], exclude: string[]): string[] {
  const results: string[] = [];

  function walk(current: string) {
    if (exclude.some(ex => current.includes(ex))) return;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (exts.some(ext => entry.name.endsWith(ext))) {
        results.push(full);
      }
    }
  }

  walk(dir);
  return results;
}

function run(): void {
  const sourceFiles = collectSourceFiles(
    ROOT,
    [".ts", ".tsx", ".js", ".jsx"],
    ["node_modules", ".next", ".git", "scripts", "packages"],
  );

  const violations: GateViolation[] = [];

  for (const filePath of sourceFiles) {
    const content = fs.readFileSync(filePath, "utf8");
    const relativePath = path.relative(ROOT, filePath);

    // Import graph analysis
    const importViolations = analyzeImportGraph(relativePath, content, importGraphRules);
    violations.push(...importViolations);

    // React hook analysis
    const hookViolations = analyzeHooks(relativePath, content, reactHookRules);
    violations.push(...hookViolations);

    // Model call analysis
    const modelViolations = analyzeModelCalls(relativePath, content);
    violations.push(...modelViolations);
  }

  const errors = violations.filter(v => v.severity === "error");
  const warnings = violations.filter(v => v.severity === "warning");

  if (warnings.length) {
    process.stdout.write(`\n[AST-GATE] ⚠ ${warnings.length} warning(s):\n`);
    for (const w of warnings) {
      process.stdout.write(`  WARN  ${w.file} — ${w.rule}: ${w.detail}\n`);
    }
  }

  if (errors.length) {
    process.stderr.write(`\n[AST-GATE] ✗ ${errors.length} error(s):\n`);
    for (const e of errors) {
      const loc = e.line ? `:${e.line}` : "";
      process.stderr.write(`  ERROR ${e.file}${loc} — ${e.rule}: ${e.detail}\n`);
    }
    process.stderr.write(`\n[AST-GATE] FAILED — fix errors above before deploying.\n`);
    process.exit(1);
  }

  process.stdout.write(`\n[AST-GATE] ✓ ${sourceFiles.length} files checked. ${warnings.length} warnings. No errors.\n`);
  process.exit(0);
}

run();
