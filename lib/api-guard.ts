/* Server-only request guards for /api/pipeline routes.
 *
 * - Rate limit:   10 requests / user / endpoint / hour
 * - Size limit:   reject if Content-Length > 10KB
 * - Sanitisation: recursively strip HTML tags from string inputs
 *
 * Uses the Supabase admin client to read/write `api_rate_limits`.
 * Never imported from the browser.
 */

import { supabaseAdmin } from "./supabase/admin";

const HOUR_MS = 60 * 60 * 1000;
const REQUESTS_PER_HOUR = 10;
const MAX_PAYLOAD_BYTES = 10 * 1024; // 10KB

export type GuardSuccess<T> = {
  ok: true;
  payload: T;
};

export type GuardFailure = {
  ok: false;
  status: number;
  body: { error: string };
};

export type GuardResult<T> = GuardSuccess<T> | GuardFailure;

/* ────────────────────────────────────────────────────────────────
 *  Sanitisation
 * ─────────────────────────────────────────────────────────────── */

const HTML_TAG_RE = /<[^>]*>/g;

export function clean(input: string): string {
  return input.replace(HTML_TAG_RE, "").trim();
}

function sanitizeRecursive(value: unknown): unknown {
  if (typeof value === "string") return clean(value);
  if (Array.isArray(value)) return value.map(sanitizeRecursive);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeRecursive(v);
    }
    return out;
  }
  return value;
}

/* ────────────────────────────────────────────────────────────────
 *  Rate limiting (sliding 1-hour window per user+endpoint)
 * ─────────────────────────────────────────────────────────────── */

export async function enforceRateLimit(
  userId: string,
  endpoint: string,
): Promise<GuardFailure | null> {
  const now = new Date();
  const windowFloor = new Date(now.getTime() - HOUR_MS);

  const { data: existing, error: selectErr } = await supabaseAdmin
    .from("api_rate_limits")
    .select("id, request_count, window_start")
    .eq("user_id", userId)
    .eq("endpoint", endpoint)
    .gte("window_start", windowFloor.toISOString())
    .order("window_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selectErr) {
    console.error("[api-guard] rate-limit select failed", selectErr);
    // Fail open if the table doesn't exist yet; never wedge the API.
    return null;
  }

  if (!existing) {
    const { error: insertErr } = await supabaseAdmin.from("api_rate_limits").insert({
      user_id: userId,
      endpoint,
      request_count: 1,
      window_start: now.toISOString(),
    });
    if (insertErr) console.error("[api-guard] rate-limit insert failed", insertErr);
    return null;
  }

  if (existing.request_count >= REQUESTS_PER_HOUR) {
    return {
      ok: false,
      status: 429,
      body: { error: "rate_limit_exceeded" },
    };
  }

  const { error: updateErr } = await supabaseAdmin
    .from("api_rate_limits")
    .update({ request_count: existing.request_count + 1 })
    .eq("id", existing.id);

  if (updateErr) console.error("[api-guard] rate-limit update failed", updateErr);

  return null;
}

/* ────────────────────────────────────────────────────────────────
 *  Combined guard
 * ─────────────────────────────────────────────────────────────── */

export interface GuardOptions {
  userId: string;
  endpoint: string;
  request: Request;
}

export async function guardPipelineRequest<T = unknown>(
  opts: GuardOptions,
): Promise<GuardResult<T>> {
  const sizeHeader = opts.request.headers.get("content-length");
  if (sizeHeader) {
    const size = Number(sizeHeader);
    if (Number.isFinite(size) && size > MAX_PAYLOAD_BYTES) {
      return { ok: false, status: 413, body: { error: "payload_too_large" } };
    }
  }

  const limited = await enforceRateLimit(opts.userId, opts.endpoint);
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await opts.request.json();
  } catch {
    return { ok: false, status: 400, body: { error: "invalid_json" } };
  }

  if (raw && typeof raw === "object") {
    const serializedSize = new TextEncoder().encode(JSON.stringify(raw)).byteLength;
    if (serializedSize > MAX_PAYLOAD_BYTES) {
      return { ok: false, status: 413, body: { error: "payload_too_large" } };
    }
  }

  const payload = sanitizeRecursive(raw) as T;
  return { ok: true, payload };
}
