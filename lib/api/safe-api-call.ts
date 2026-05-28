/**
 * Client-side fetch wrapper with AFAF layer classification.
 *
 * Replaces bare fetch() in frontend code. Returns a structured result with:
 *   - parsed response (or { raw } if not JSON)
 *   - latency measurement
 *   - layer classification on failure
 *   - console-logged trace for debugging
 *
 * Usage:
 *   const { ok, status, latency, response } = await safeApiCall("/api/generate-brief", { goal });
 */

export type SafeApiResult<T = unknown> = {
  ok:        boolean;
  status?:   number;
  latency:   number;
  requestId: string | null;
  response:  T | { raw: string } | null;
  layer?:    string;
  error?:    string;
};

export async function safeApiCall<T = unknown>(
  url:  string,
  body: unknown,
  options?: RequestInit,
): Promise<SafeApiResult<T>> {
  const start = performance.now();

  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
      ...options,
    });

    const latency    = performance.now() - start;
    const requestId  = res.headers.get("X-Request-Id");
    const text       = await res.text();

    let parsed: T | { raw: string };
    try {
      parsed = JSON.parse(text) as T;
    } catch {
      parsed = { raw: text };
    }

    if (!res.ok) {
      const trace = (parsed as { trace?: { layer?: string; error?: { message?: string } } })?.trace;
      const layer = trace?.layer ?? "L1 (handler crash / unknown runtime failure)";
      console.error(`[AFAF] ${url} → ${layer} (${res.status}) — ${trace?.error?.message ?? text.slice(0, 200)}`);
      return { ok: false, status: res.status, latency, requestId, response: parsed, layer };
    }

    return { ok: true, status: res.status, latency, requestId, response: parsed };

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const latency  = performance.now() - start;

    const layer = message.includes("Failed to fetch") || message.includes("ERR_EMPTY_RESPONSE")
      ? "L1 (network failure / empty response)"
      : "L1 (handler crash / unknown runtime failure)";

    console.error(`[AFAF] ${url} → ${layer} — ${message}`);

    return { ok: false, latency, requestId: null, response: null, layer, error: message };
  }
}

// ── Streaming variant (returns ReadableStream for text/event-stream routes) ────

export type SafeStreamResult = {
  ok:        boolean;
  status?:   number;
  latency:   number;
  requestId: string | null;
  stream?:   ReadableStream<Uint8Array>;
  layer?:    string;
  error?:    string;
};

export async function safeStreamCall(
  url:  string,
  body: unknown,
): Promise<SafeStreamResult> {
  const start = performance.now();

  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });

    const latency   = performance.now() - start;
    const requestId = res.headers.get("X-Request-Id");

    if (!res.ok) {
      const text  = await res.text();
      const layer = res.status === 404
        ? "L0 (routing failure)"
        : "L1 (handler crash / unknown runtime failure)";
      console.error(`[AFAF] ${url} → ${layer} (${res.status})`);
      return { ok: false, status: res.status, latency, requestId, layer, error: text };
    }

    return { ok: true, status: res.status, latency, requestId, stream: res.body ?? undefined };

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok:        false,
      latency:   performance.now() - start,
      requestId: null,
      layer:     "L1 (network failure / empty response)",
      error:     message,
    };
  }
}
