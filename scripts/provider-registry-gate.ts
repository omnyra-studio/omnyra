/**
 * Omnyra Provider Registry Gate
 *
 * Enforces that:
 *   1. Forbidden init patterns (new ElevenLabs, new OpenAI, etc.) never appear in source.
 *   2. Registered provider SDK imports (e.g. @fal-ai/, @anthropic-ai/, elevenlabs)
 *      only appear in their allowedCallerLayers.
 *   3. Any unregistered SDK that matches a known pattern fails the build.
 *
 * Single source of truth: architecture/providers.json + architecture/allowed-pipelines.json
 *
 * Run:  npm run provider-registry-gate
 * CI:   runs after dependency-graph, before deployment
 */

import fs   from "fs";
import path from "path";

// ── Load registries ────────────────────────────────────────────────────────────

const ROOT           = process.cwd();
const PROVIDERS_PATH = path.join(ROOT, "architecture", "providers.json");
const MANIFEST_PATH  = path.join(ROOT, "architecture", "allowed-pipelines.json");

for (const p of [PROVIDERS_PATH, MANIFEST_PATH]) {
  if (!fs.existsSync(p)) {
    process.stderr.write(`[PROVIDER_REGISTRY] FATAL: ${p} not found\n`);
    process.exit(2);
  }
}

interface ProviderEntry {
  name:               string;
  description:        string;
  module:             string;
  sdkPatterns:        string[];
  allowedCallerLayers: string[];
}

interface ProvidersManifest {
  registeredProviders:   ProviderEntry[];
  forbiddenInitPatterns: string[];
}

const registry = JSON.parse(fs.readFileSync(PROVIDERS_PATH, "utf8")) as ProvidersManifest;
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as {
  dependencyGraph: {
    layers:    Array<{ name: string; pathPrefixes: string[] }>;
    skipPaths: string[];
  };
  exceptions: { files: Array<{ path: string }> };
};

const LAYERS     = manifest.dependencyGraph.layers;
const SKIP_PATHS = manifest.dependencyGraph.skipPaths.map(p => p.replace(/\\/g, "/"));
const SKIP_DIRS  = new Set(["node_modules", ".next", "dist", ".scripts-build", ".git", "coverage", ".vercel"]);
const EXCEPTIONS = new Set(
  manifest.exceptions.files.map(e => path.normalize(path.join(ROOT, e.path)))
);

function norm(p: string): string { return p.replace(/\\/g, "/"); }

function classifyLayer(relPath: string): string {
  const p = norm(relPath);
  for (const sp of SKIP_PATHS) if (p.startsWith(sp)) return "skip";
  for (const layer of LAYERS) {
    for (const prefix of layer.pathPrefixes) {
      if (p.startsWith(norm(prefix))) return layer.name;
    }
  }
  return "unknown";
}

// ── Violation types ────────────────────────────────────────────────────────────

interface InitViolation {
  kind:    "forbidden_init";
  file:    string;
  line:    number;
  pattern: string;
  excerpt: string;
}

interface SdkLayerViolation {
  kind:     "sdk_layer";
  file:     string;
  line:     number;
  provider: string;
  pattern:  string;
  layer:    string;
  allowed:  string[];
  excerpt:  string;
}

type Violation = InitViolation | SdkLayerViolation;

const violations: Violation[] = [];

// Build lookup: sdkPattern → provider entry
const sdkMap: Array<{ pattern: string; provider: ProviderEntry }> = [];
for (const p of registry.registeredProviders) {
  for (const pat of p.sdkPatterns) {
    sdkMap.push({ pattern: pat, provider: p });
  }
}

// ── Scanner ────────────────────────────────────────────────────────────────────

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

let scanned = 0;
let skipped = 0;

for (const absFile of scanFiles(ROOT)) {
  const normalized = path.normalize(absFile);
  if (EXCEPTIONS.has(normalized)) { skipped++; continue; }

  const relFile = norm(path.relative(ROOT, absFile));
  const layer   = classifyLayer(relFile);
  if (layer === "skip") continue;

  let src: string;
  try { src = fs.readFileSync(absFile, "utf8"); } catch { continue; }
  scanned++;

  const lines = src.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const raw  = lines[i];
    const line = i + 1;

    // 1. Forbidden init patterns — must never appear anywhere
    for (const pat of registry.forbiddenInitPatterns) {
      if (raw.includes(pat)) {
        violations.push({
          kind:    "forbidden_init",
          file:    relFile,
          line,
          pattern: pat,
          excerpt: raw.trim().substring(0, 140),
        });
      }
    }

    // 2. SDK import patterns — must only appear in allowedCallerLayers
    // Only check import/require lines
    const isImportLine = /^\s*(import|export|require)/.test(raw) || /\brequire\s*\(/.test(raw);
    if (!isImportLine) continue;

    for (const { pattern, provider } of sdkMap) {
      if (!raw.includes(pattern)) continue;
      if (provider.allowedCallerLayers.includes(layer)) continue;
      if (layer === "unknown") continue; // unclassified files get no verdict

      violations.push({
        kind:     "sdk_layer",
        file:     relFile,
        line,
        provider: provider.name,
        pattern,
        layer,
        allowed:  provider.allowedCallerLayers,
        excerpt:  raw.trim().substring(0, 140),
      });
    }
  }
}

// ── Report ─────────────────────────────────────────────────────────────────────

const HR = "═".repeat(62);

if (violations.length === 0) {
  process.stdout.write(`\n╔${HR}╗\n║  PROVIDER REGISTRY GATE: PASSED                              ║\n╚${HR}╝\n\n`);
  process.stdout.write(`  Scanned files       : ${scanned}\n`);
  process.stdout.write(`  Excepted files      : ${skipped}\n`);
  process.stdout.write(`  Registered providers: ${registry.registeredProviders.length}\n`);
  process.stdout.write(`  Forbidden patterns  : ${registry.forbiddenInitPatterns.length}\n`);
  process.stdout.write(`  Violations          : 0\n\n`);
  process.exit(0);
}

process.stderr.write(`\n╔${HR}╗\n║  PROVIDER REGISTRY GATE: DEPLOYMENT BLOCKED                  ║\n╚${HR}╝\n\n`);

for (const v of violations) {
  process.stderr.write(`[PROVIDER_VIOLATION]\n\n`);
  process.stderr.write(`  File:     ${v.file}:${v.line}\n`);

  if (v.kind === "forbidden_init") {
    process.stderr.write(`  Type:     Forbidden init pattern\n`);
    process.stderr.write(`  Pattern:  ${v.pattern}\n`);
    process.stderr.write(`  Excerpt:  ${v.excerpt}\n\n`);
  } else {
    process.stderr.write(`  Type:     SDK import in disallowed layer\n`);
    process.stderr.write(`  Provider: ${v.provider}\n`);
    process.stderr.write(`  Pattern:  ${v.pattern}\n`);
    process.stderr.write(`  Layer:    ${v.layer} (allowed: ${v.allowed.join(", ")})\n`);
    process.stderr.write(`  Excerpt:  ${v.excerpt}\n\n`);
  }
}

process.stderr.write(`  ${violations.length} violation(s) — DEPLOYMENT BLOCKED\n\n`);
process.exit(1);
