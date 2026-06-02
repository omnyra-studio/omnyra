/**
 * Omnyra Dependency Graph Enforcer
 *
 * 1. Parses all .ts/.tsx/.js/.jsx files and extracts imports
 * 2. Classifies each file and import into architecture layers
 * 3. Checks every import edge against allowed edges in the manifest
 * 4. Detects drift against the committed baseline (architecture/dependency-graph.json)
 * 5. Writes a new dependency-graph.json
 * 6. Exits 1 on violations or excessive drift
 *
 * Run:  npm run dependency-graph
 * CI:   runs after architecture-gate, before deployment
 */

import fs   from "fs";
import path from "path";

// ── Manifest ───────────────────────────────────────────────────────────────────

const ROOT          = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "architecture", "allowed-pipelines.json");
const GRAPH_PATH    = path.join(ROOT, "architecture", "dependency-graph.json");

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const cfg       = manifest.dependencyGraph as {
  layers: Array<{ name: string; pathPrefixes: string[] }>;
  skipPaths: string[];
  allowedEdges: Array<{ from: string; to: string }>;
  forbiddenEdgeMessages: Record<string, string>;
  externalSdkPatterns: string[];
  forbiddenExternalFromLayers: string[];
  driftThresholds: { warnPercent: number; failPercent: number };
};

if (!cfg) {
  process.stderr.write("[DEPENDENCY_GRAPH] FATAL: manifest missing 'dependencyGraph' section\n");
  process.exit(2);
}

// ── Layer classification ───────────────────────────────────────────────────────

type Layer = string;

const ALLOWED_EDGES = new Set(cfg.allowedEdges.map(e => `${e.from}->${e.to}`));
const FORBIDDEN_MESSAGES: Record<string, string> = cfg.forbiddenEdgeMessages;
const SKIP_PREFIXES: string[] = cfg.skipPaths.map(p => p.replace(/\\/g, "/"));

const SKIP_DIRS = new Set(["node_modules", ".next", "dist", ".scripts-build", ".git", "coverage", ".vercel"]);

function norm(p: string): string { return p.replace(/\\/g, "/"); }

function classifyPath(relPath: string): Layer | "external" | "skip" | "unknown" {
  const p = norm(relPath);
  for (const sp of SKIP_PREFIXES) if (p.startsWith(sp)) return "skip";
  for (const layer of cfg.layers) {
    for (const prefix of layer.pathPrefixes) {
      if (p.startsWith(norm(prefix))) return layer.name;
    }
  }
  return "unknown";
}

function resolveImport(sourceFile: string, imp: string): { layer: Layer | "external" | "unknown"; resolved: string } {
  if (!imp.startsWith(".") && !imp.startsWith("@/")) {
    return { layer: "external", resolved: imp };
  }
  let rel: string;
  if (imp.startsWith("@/")) {
    rel = imp.slice(2);
  } else {
    const abs = path.resolve(path.dirname(sourceFile), imp);
    rel = path.relative(ROOT, abs);
  }
  rel = norm(rel).replace(/\.(ts|tsx|js|jsx)$/, "");
  const layer = classifyPath(rel);
  return { layer: layer === "skip" ? "unknown" : layer, resolved: rel };
}

// ── Edge validity ──────────────────────────────────────────────────────────────

function checkEdge(
  fromLayer: Layer | "external" | "unknown",
  toLayer:   Layer | "external" | "unknown",
  impPath:   string,
): { allowed: boolean; message?: string } {
  if (fromLayer === "unknown" || fromLayer === "external") return { allowed: true };
  if (toLayer   === "unknown") return { allowed: true };
  if (fromLayer === toLayer)   return { allowed: true };

  if (toLayer === "external") {
    if (cfg.forbiddenExternalFromLayers.includes(fromLayer)) {
      const sdk = cfg.externalSdkPatterns.find(p => impPath.includes(p));
      if (sdk) return { allowed: false, message: `${fromLayer} must not import external AI/media SDKs (${sdk}). Route via API or provider layer.` };
    }
    return { allowed: true };
  }

  const key = `${fromLayer}->${toLayer}`;
  if (ALLOWED_EDGES.has(key)) return { allowed: true };
  return { allowed: false, message: FORBIDDEN_MESSAGES[key] ?? `Illegal: ${fromLayer} → ${toLayer}` };
}

// ── Import extraction ──────────────────────────────────────────────────────────

const IMPORT_RE    = /^(?:import|export)(?:\s+\{[^}]*\}|\s+\*\s+as\s+\w+|\s+[\w$]+(?:\s*,\s*\{[^}]*\})?)?\s+from\s+['"]([^'"]+)['"]/gm;
const SIDE_FX_RE   = /^import\s+['"]([^'"]+)['"]/gm;
const REQUIRE_RE   = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function extractImports(src: string): string[] {
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  for (const re of [IMPORT_RE, SIDE_FX_RE, REQUIRE_RE]) {
    re.lastIndex = 0;
    while ((m = re.exec(src)) !== null) seen.add(m[1]);
  }
  return Array.from(seen);
}

// ── File scanner ───────────────────────────────────────────────────────────────

function scanFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try { entries = fs.readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e)) continue;
    const full = path.join(dir, e);
    let stat: fs.Stats;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isDirectory()) { out.push(...scanFiles(full)); continue; }
    if (/\.(ts|tsx|js|jsx)$/.test(full)) out.push(full);
  }
  return out;
}

// ── Main scan ──────────────────────────────────────────────────────────────────

interface GraphEdge {
  from:      string;
  fromLayer: string;
  to:        string;
  toLayer:   string;
  allowed:   boolean;
  message?:  string;
}

const violations: GraphEdge[] = [];
const allEdges:   GraphEdge[] = [];
const layerCounts: Record<string, number> = {};

for (const absFile of scanFiles(ROOT)) {
  const relFile = norm(path.relative(ROOT, absFile));
  const srcLayer = classifyPath(relFile);
  if (srcLayer === "skip") continue;

  layerCounts[srcLayer] = (layerCounts[srcLayer] ?? 0) + 1;

  let src: string;
  try { src = fs.readFileSync(absFile, "utf8"); } catch { continue; }

  for (const imp of extractImports(src)) {
    const { layer: tLayer, resolved } = resolveImport(relFile, imp);
    const { allowed, message }        = checkEdge(srcLayer, tLayer, imp);
    const edge: GraphEdge = { from: relFile, fromLayer: srcLayer, to: resolved, toLayer: tLayer ?? "external", allowed, ...(message ? { message } : {}) };
    allEdges.push(edge);
    if (!allowed) violations.push(edge);
  }
}

// ── Drift detection ────────────────────────────────────────────────────────────

interface DriftResult {
  score:   number;
  added:   GraphEdge[];
  removed: GraphEdge[];
  warn:    boolean;
  fail:    boolean;
}

function detectDrift(): DriftResult | null {
  if (!fs.existsSync(GRAPH_PATH)) return null;
  let baseline: { edges?: GraphEdge[] };
  try { baseline = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf8")); } catch { return null; }

  const baseEdges = baseline.edges ?? [];
  const baseSet   = new Set(baseEdges.map(e => `${e.from}::${e.to}`));
  const newSet    = new Set(allEdges.map(e => `${e.from}::${e.to}`));
  const baseMap   = new Map(baseEdges.map(e => [`${e.from}::${e.to}`, e]));

  const added:   GraphEdge[] = allEdges.filter(e => !baseSet.has(`${e.from}::${e.to}`));
  const removed: GraphEdge[] = baseEdges.filter(e => !newSet.has(`${e.from}::${e.to}`));

  const baseCount = baseEdges.length || 1;
  const score     = Math.round((added.length / baseCount) * 100);
  void baseMap;

  return {
    score,
    added,
    removed,
    warn: score >= cfg.driftThresholds.warnPercent,
    fail: score >= cfg.driftThresholds.failPercent,
  };
}

const drift = detectDrift();

// ── Write graph ────────────────────────────────────────────────────────────────

const graphOut = {
  generated: new Date().toISOString(),
  stats: {
    totalFiles: Object.values(layerCounts).reduce((a, b) => a + b, 0),
    totalEdges: allEdges.length,
    violations: violations.length,
    layers:     layerCounts,
  },
  nodes: Object.entries(layerCounts).map(([layer, count]) => ({ layer, count })),
  edges: allEdges,
  violations,
  drift: drift ? { score: drift.score, addedEdges: drift.added.length, removedEdges: drift.removed.length } : null,
};

fs.writeFileSync(GRAPH_PATH, JSON.stringify(graphOut, null, 2));

// ── Report ─────────────────────────────────────────────────────────────────────

const HR = "═".repeat(62);
let exitCode = 0;

if (violations.length === 0 && (!drift || !drift.fail)) {
  process.stdout.write(`\n╔${HR}╗\n║  DEPENDENCY GRAPH: PASSED                                    ║\n╚${HR}╝\n\n`);
  process.stdout.write(`  Files   : ${graphOut.stats.totalFiles}   Edges: ${allEdges.length}   Violations: 0\n`);
  process.stdout.write(`  Graph   : architecture/dependency-graph.json\n`);
  if (drift) process.stdout.write(`  Drift   : ${drift.score}% (warn=${cfg.driftThresholds.warnPercent}% fail=${cfg.driftThresholds.failPercent}%)\n`);
  process.stdout.write(`\n`);
} else {
  process.stderr.write(`\n╔${HR}╗\n║  DEPENDENCY GRAPH: VIOLATIONS DETECTED                       ║\n╚${HR}╝\n\n`);
}

if (violations.length > 0) {
  exitCode = 1;
  for (const v of violations) {
    process.stderr.write(`[ARCHITECTURE_GRAPH]\n\n`);
    process.stderr.write(`  File:           ${v.from}\n`);
    process.stderr.write(`  Illegal Import: ${v.to}\n`);
    process.stderr.write(`  Allowed:        ${v.fromLayer} → see allowedEdges in manifest\n`);
    process.stderr.write(`  Actual:         ${v.fromLayer} → ${v.toLayer}\n`);
    if (v.message) process.stderr.write(`  Reason:         ${v.message}\n`);
    process.stderr.write(`\n`);
  }
  process.stderr.write(`  ${violations.length} violation(s) — DEPLOYMENT BLOCKED\n\n`);
}

if (drift) {
  if (drift.fail) {
    exitCode = 1;
    process.stderr.write(`[ARCHITECTURE_DRIFT]\n\n`);
    process.stderr.write(`  Drift Score: ${drift.score}% (threshold: fail at ${cfg.driftThresholds.failPercent}%)\n`);
    process.stderr.write(`  Added edges: ${drift.added.length}   Removed edges: ${drift.removed.length}\n`);
    process.stderr.write(`  Status: REVIEW REQUIRED — excessive drift, DEPLOYMENT BLOCKED\n\n`);
    for (const e of drift.added.slice(0, 10)) {
      process.stderr.write(`  Added Edge:  ${e.from} → ${e.to}  [${e.fromLayer} → ${e.toLayer}]\n`);
    }
  } else if (drift.warn) {
    process.stdout.write(`[ARCHITECTURE_DRIFT] WARNING: ${drift.score}% drift (threshold: warn at ${cfg.driftThresholds.warnPercent}%)\n`);
    process.stdout.write(`  Added ${drift.added.length} edges, removed ${drift.removed.length}\n`);
  }
}

process.exit(exitCode);
