/**
 * Omnyra Execution Integrity System — Runtime Guardrail Layer.
 *
 * Enforces the single valid execution pipeline:
 *   Director Core → Scene Planner → Provider Router → Execution Engine
 *
 * Every violation is classified as a system failure and hard-fails.
 * No fallback. No silent correction. No retry on architecture violations.
 *
 * Integration points (MUST be called at each entry):
 *   - POST /api/generate-avatar
 *   - POST /api/avatar-worker
 *   - Any queue worker processing video jobs
 */

// ── Forbidden patterns ─────────────────────────────────────────────────────────

const FORBIDDEN_PATTERNS = [
  "synclabs",
  "lipSyncVideo",
  "sync-lipsync",
  "syncLipsync",
] as const;

type ForbiddenPattern = typeof FORBIDDEN_PATTERNS[number];

// ── Valid pipeline stages ──────────────────────────────────────────────────────

const VALID_STAGES = new Set(["tts", "animate", "lipsync", "done"]);

// ── Violation counters (in-process metrics — reset on cold start) ──────────────

let legacyPipelineBlockedTotal   = 0;
let invalidJobRejectedTotal      = 0;
let schemaViolationTotal         = 0;
let executionGuardrailTotal      = 0;

export function getGuardrailMetrics() {
  return {
    legacy_pipeline_blocked_total:    legacyPipelineBlockedTotal,
    invalid_job_rejected_total:       invalidJobRejectedTotal,
    schema_violation_total:           schemaViolationTotal,
    execution_guardrail_triggered_total: executionGuardrailTotal,
  };
}

// ── Error class ────────────────────────────────────────────────────────────────

export class LegacyPipelineViolationError extends Error {
  readonly hit:     ForbiddenPattern | string;
  readonly context: string | undefined;

  constructor(hit: string, context?: string) {
    super(
      `[FATAL] Legacy lipsync invocation detected (${hit})` +
      (context ? ` | context: ${context}` : ""),
    );
    this.name    = "LegacyPipelineViolationError";
    this.hit     = hit;
    this.context = context;
  }
}

export class ArchitectureViolationError extends Error {
  readonly context: string | undefined;

  constructor(reason: string, context?: string) {
    super(
      `[FATAL] Architecture violation: ${reason}` +
      (context ? ` | context: ${context}` : ""),
    );
    this.name    = "ArchitectureViolationError";
    this.context = context;
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

function safeStringify(obj: unknown): string {
  try { return JSON.stringify(obj); } catch { return String(obj); }
}

function captureViolation(
  kind: string,
  payload: unknown,
  context: string | undefined,
  hit: string,
): void {
  console.error(`[LEGACY_VIOLATION]`, {
    kind,
    hit,
    context,
    payload:   safeStringify(payload).substring(0, 500),
    stack:     new Error().stack,
    timestamp: new Date().toISOString(),
  });
}

// ── Layer 3: Execution Guardrail ───────────────────────────────────────────────

/**
 * HARD FAIL guard — call at every API handler and worker entry point.
 *
 * Throws LegacyPipelineViolationError immediately on any forbidden pattern.
 * The job MUST be marked FAILED_ARCHITECTURE_VIOLATION and NOT retried.
 */
export function assertNoLegacyLipsync(payload: unknown, context?: string): void {
  const serialized = safeStringify(payload).toLowerCase();

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (serialized.includes(pattern.toLowerCase())) {
      legacyPipelineBlockedTotal++;
      executionGuardrailTotal++;
      captureViolation("legacy_lipsync", payload, context, pattern);
      throw new LegacyPipelineViolationError(pattern, context);
    }
  }
}

/**
 * Verify the job pipeline field names are valid Director Core stages.
 * Throws ArchitectureViolationError if any stage is unknown.
 */
export function assertDirectorPipelineOnly(
  stage: string | null | undefined,
  context?: string,
): void {
  if (stage !== null && stage !== undefined && !VALID_STAGES.has(stage)) {
    executionGuardrailTotal++;
    schemaViolationTotal++;
    captureViolation("invalid_stage", { stage }, context, stage);
    throw new ArchitectureViolationError(`unknown stage "${stage}"`, context);
  }
}

// ── Layer 2: Runtime schema validation ────────────────────────────────────────

interface DirectorVideoJobInput {
  script:        string;
  voice_id?:     string | null;
  image_url:     string;
  plan?:         "starter" | "studio";
  character_id?: string | null;
}

/**
 * Validate a raw job input against the DirectorVideoJob schema.
 *
 * Returns the typed input on success.
 * Throws LegacyPipelineViolationError or TypeError on invalid structure.
 */
export function parseDirectorVideoJobInput(raw: unknown, context?: string): DirectorVideoJobInput {
  if (!raw || typeof raw !== "object") {
    invalidJobRejectedTotal++;
    throw new TypeError(`[SCHEMA] job input must be an object | context: ${context}`);
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.script !== "string" || !obj.script.trim()) {
    invalidJobRejectedTotal++;
    throw new TypeError(`[SCHEMA] script must be a non-empty string | context: ${context}`);
  }

  if (typeof obj.image_url !== "string" || !obj.image_url.startsWith("https://")) {
    invalidJobRejectedTotal++;
    throw new TypeError(`[SCHEMA] image_url must be an https URL | context: ${context}`);
  }

  // Pattern check on the whole input
  assertNoLegacyLipsync(raw, context);

  return {
    script:       obj.script.trim(),
    voice_id:     typeof obj.voice_id === "string" ? obj.voice_id : null,
    image_url:    obj.image_url as string,
    plan:         obj.plan === "studio" ? "studio" : "starter",
    character_id: typeof obj.character_id === "string" ? obj.character_id : null,
  };
}

/**
 * Sanitize a queue job before processing.
 * Returns the job unchanged if clean; throws on contamination.
 */
export function sanitizeJob<T>(job: T, context?: string): T {
  assertNoLegacyLipsync(job, context ?? "sanitizeJob");
  return job;
}
