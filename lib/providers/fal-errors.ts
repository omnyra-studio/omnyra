/**
 * Shared FAL error formatting — surfaces full 422 validation bodies in logs.
 */

export function formatFalError(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);

  const e = error as {
    message?:   string;
    status?:    number;
    statusCode?: number;
    body?:      unknown;
    detail?:    unknown;
    response?:  { status?: number; data?: unknown };
    data?:      unknown;
  };

  const status = e.status ?? e.statusCode ?? e.response?.status;
  const parts: string[] = [e.message ?? "fal error"];

  if (status) parts.push(`status=${status}`);

  const detail = e.body ?? e.detail ?? e.response?.data ?? e.data;
  if (detail !== undefined) {
    const serialized = typeof detail === "string" ? detail : JSON.stringify(detail);
    parts.push(serialized.slice(0, 2000));
  }

  return parts.join(" | ");
}

/** Log full FAL payload before subscribe (redacts nothing — server-side only). */
export function logFalPayload(label: string, model: string, payload: Record<string, unknown>): void {
  console.log(`[FAL_PAYLOAD] ${label} model=${model}`);
  console.log(JSON.stringify(payload, null, 2));
}

/** Log structured error with full response body. */
export function logFalError(label: string, error: unknown, latencyMs?: number): void {
  const msg = formatFalError(error);
  console.error(`[FAL_ERROR] ${label}${latencyMs !== undefined ? ` after ${latencyMs}ms` : ""}:`, msg);

  if (error && typeof error === "object") {
    const e = error as { body?: unknown; detail?: unknown; response?: { data?: unknown } };
    const raw = e.body ?? e.detail ?? e.response?.data;
    if (raw !== undefined) {
      console.error(`[FAL_ERROR_BODY] ${label}:`, typeof raw === "string" ? raw : JSON.stringify(raw, null, 2));
    }
  }
}