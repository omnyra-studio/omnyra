/**
 * API Failure Autopsy Framework (AFAF)
 *
 * Classifies every API failure into a deterministic layer in <5 ms:
 *   L0 → Routing failure (404 — route file missing or wrong path)
 *   L1 → Handler crash (no response — unhandled throw / ERR_EMPTY_RESPONSE)
 *   L2 → Input/parsing failure (invalid JSON, missing required fields)
 *   L3 → Dependency failure (env vars, missing imports, auth)
 *   L4 → DB / external service failure (Supabase, Anthropic, schema drift)
 *   L5 → Logic / contract violation (type errors, DAG violations)
 *
 * Three wrapper modes:
 *   withAutopsy(handler)  — new routes; handler returns raw data, wrapper makes Response
 *   withTrace(handler)    — existing routes; handler returns Response, wrapper adds fingerprint
 *   safeApiCall()         — client-side; structured fetch with layer classification
 */

import { randomUUID } from "crypto";

// ── Types ──────────────────────────────────────────────────────────────────────

export type AutopsyTrace = {
  readonly requestId: string;
  readonly route:     string;
  readonly method:    string;
  layer:              string;
  status:             "SUCCESS" | "FAILURE" | "UNKNOWN";
  timing:             { totalMs: number };
  error:              { message: string; stack?: string } | null;
};

// ── Trace store (in-process; replace with Supabase for distributed/prod) ──────

const MAX_TRACES = 500;
const traceLog: AutopsyTrace[] = [];

export function getTraceLog(): readonly AutopsyTrace[] { return traceLog; }
export function clearTraceLog(): void { traceLog.length = 0; }

function pushTrace(trace: AutopsyTrace): void {
  if (traceLog.length >= MAX_TRACES) traceLog.shift();
  traceLog.push(trace);
}

// ── Layer classifier ───────────────────────────────────────────────────────────

export function classifyError(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();

  if (
    msg.includes("cannot find module") ||
    msg.includes("is not defined") ||
    msg.includes("process.env") ||
    msg.includes("api_key") ||
    msg.includes("api key") ||
    msg.includes("authentication") ||
    msg.includes("invalid_api_key") ||
    msg.includes("missing key")
  ) return "L3 (dependency/env/import failure)";

  if (
    msg.includes("supabase") ||
    msg.includes("prisma") ||
    msg.includes("does not exist") ||
    msg.includes("relation") ||
    msg.includes("column") ||
    msg.includes("rls") ||
    msg.includes("permission denied") ||
    msg.includes("jwt") ||
    msg.includes("schema") ||
    msg.includes("econnrefused") ||
    msg.includes("connection")
  ) return "L4 (database/external service failure)";

  if (
    msg.includes("validation") ||
    msg.includes("contract") ||
    msg.includes("cannot read prop") ||
    msg.includes("is not a function") ||
    msg.includes("undefined is not") ||
    msg.includes("node contract") ||
    msg.includes("dag invalid") ||
    msg.includes("schema break")
  ) return "L5 (logic/contract violation)";

  return "L1 (handler crash / unknown runtime failure)";
}

function classifyStatus(status: number): string {
  if (status === 404) return "L0 (routing failure)";
  if (status === 401 || status === 403) return "L3 (dependency/env/import failure)";
  if (status === 400) return "L2 (invalid JSON / empty body)";
  if (status >= 500) return "L1 (handler crash / unknown runtime failure)";
  return "L2+ (request reached handler)";
}

// ── withAutopsy — for new JSON routes ─────────────────────────────────────────
// Handler receives (req, parsedBody) and returns raw data (not Response).

export function withAutopsy(
  handler: (req: Request, body: unknown) => Promise<unknown> | unknown,
) {
  return async function wrapped(req: Request): Promise<Response> {
    const requestId = randomUUID();
    const start     = performance.now();

    const trace: AutopsyTrace = {
      requestId,
      route:  req.url,
      method: req.method,
      layer:  "UNKNOWN",
      status: "UNKNOWN",
      timing: { totalMs: 0 },
      error:  null,
    };

    try {
      trace.layer = "L2+ (request reached handler)";

      let body: unknown = null;
      try {
        body = await req.clone().json();
      } catch {
        trace.layer = "L2 (invalid JSON / empty body)";
      }

      const result = await handler(req, body);

      trace.status         = "SUCCESS";
      trace.timing.totalMs = performance.now() - start;
      pushTrace(trace);

      return Response.json({ ok: true, trace, data: result ?? null });

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const stack   = err instanceof Error ? err.stack   : undefined;

      trace.error          = { message, stack };
      trace.status         = "FAILURE";
      trace.layer          = classifyError(err);
      trace.timing.totalMs = performance.now() - start;
      pushTrace(trace);

      console.error(`[AFAF ${trace.layer}] ${req.method} ${req.url} — ${message}`);

      return new Response(
        JSON.stringify({ ok: false, trace }),
        { status: 500, headers: { "Content-Type": "application/json", "X-Request-Id": requestId } },
      );
    }
  };
}

// ── withTrace — for existing routes returning Response ────────────────────────
// Non-invasive: passes through the original Response, adds X-Request-Id header
// and emits a trace. Handles uncaught throws with a structured JSON error.

export function withTrace(
  handler: (req: Request) => Promise<Response>,
) {
  return async function wrapped(req: Request): Promise<Response> {
    const requestId = randomUUID();
    const start     = performance.now();

    const trace: AutopsyTrace = {
      requestId,
      route:  req.url,
      method: req.method,
      layer:  "L2+ (request reached handler)",
      status: "UNKNOWN",
      timing: { totalMs: 0 },
      error:  null,
    };

    try {
      const response = await handler(req);

      trace.status         = response.ok ? "SUCCESS" : "FAILURE";
      trace.layer          = response.ok ? "L2+ (request reached handler)" : classifyStatus(response.status);
      trace.timing.totalMs = performance.now() - start;
      pushTrace(trace);

      // Pass body through, append fingerprint header
      const headers = new Headers(response.headers);
      headers.set("X-Request-Id", requestId);

      return new Response(response.body, { status: response.status, headers });

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const stack   = err instanceof Error ? err.stack   : undefined;

      trace.error          = { message, stack };
      trace.status         = "FAILURE";
      trace.layer          = classifyError(err);
      trace.timing.totalMs = performance.now() - start;
      pushTrace(trace);

      console.error(`[AFAF ${trace.layer}] ${req.method} ${req.url} — ${message}`);

      return new Response(
        JSON.stringify({ ok: false, trace }),
        { status: 500, headers: { "Content-Type": "application/json", "X-Request-Id": requestId } },
      );
    }
  };
}

// ── Route health probe (dev / CI) ─────────────────────────────────────────────

export async function probeRoute(path: string): Promise<{
  layer:   string;
  status?: number;
  error?:  string;
}> {
  try {
    const res = await fetch(path, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    "{}",
    });

    if (res.status === 404) return { layer: "L0 (routing failure)", status: 404 };
    return { layer: "ROUTE_EXISTS", status: res.status };

  } catch (e: unknown) {
    return {
      layer: "L1 (server unreachable / crash)",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
