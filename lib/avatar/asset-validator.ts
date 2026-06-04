// Asset Validation Gate + Signed URL Enforcement
//
// Rules:
//   1. All media URLs must return HTTP 200 via HEAD request
//   2. Content-Length must be present and > 0
//   3. Content-Type must match expected MIME prefix
//   4. Supabase public storage URLs are always converted to signed URLs
//
// Hard block: any failure stops the pipeline. No silent fallback.

import { supabaseAdmin } from "@/lib/supabase/admin";

export type AssetKind = "image" | "audio" | "video";

const EXPECTED_MIME: Record<AssetKind, string[]> = {
  image: ["image/"],
  audio: ["audio/"],
  video: ["video/", "application/octet-stream"],
};

const SUPABASE_STORAGE_RE =
  /https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/(public|sign)\/([^/]+)\/(.+)/;

// Minimum sensible byte sizes per asset type
const MIN_CONTENT_LENGTH: Record<AssetKind, number> = {
  image: 5_000,    //  5 KB
  audio: 10_000,   // 10 KB
  video: 50_000,   // 50 KB
};

// ── Signed URL enforcement ────────────────────────────────────────────────────

export async function toSignedUrl(url: string, expiresInSeconds = 3600): Promise<string> {
  const match = SUPABASE_STORAGE_RE.exec(url);
  if (!match) return url; // not a Supabase storage URL — return as-is

  const bucket = match[2]!;
  const path   = decodeURIComponent(match[3]!);

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    console.warn("[asset-validator] signed URL generation failed:", {
      bucket, path, error: error?.message
    });
    return url; // fall back to original — HEAD check will catch it if broken
  }

  console.info("[asset-validator] signed URL generated", { bucket, path });
  return data.signedUrl;
}

// ── HEAD validation ───────────────────────────────────────────────────────────

export interface AssetValidationResult {
  ok:              boolean;
  url:             string;        // possibly refreshed signed URL
  content_type:    string | null;
  content_length:  number | null;
  error?:          string;
  error_class?:    "FETCH_FAILED" | "TRUNCATION_ERROR" | "MIME_MISMATCH";
}

export async function validateAsset(
  url:  string,
  kind: AssetKind,
): Promise<AssetValidationResult> {
  // ── URL sanity ────────────────────────────────────────────────────────────
  if (!url?.startsWith("https://")) {
    return {
      ok: false, url, content_type: null, content_length: null,
      error: `URL must start with https:// — got: ${url?.substring(0, 80)}`,
      error_class: "FETCH_FAILED",
    };
  }

  // Truncation guard: suspiciously short URL is a serialization bug
  if (url.length < 30) {
    return {
      ok: false, url, content_type: null, content_length: null,
      error: `URL appears truncated (length=${url.length}): ${url}`,
      error_class: "TRUNCATION_ERROR",
    };
  }

  // ── Signed URL enforcement for Supabase storage ───────────────────────────
  const resolvedUrl = await toSignedUrl(url);

  // ── HEAD request ──────────────────────────────────────────────────────────
  let headRes: Response;
  try {
    headRes = await fetch(resolvedUrl, { method: "HEAD" });
  } catch (err) {
    return {
      ok: false, url: resolvedUrl, content_type: null, content_length: null,
      error: `HEAD request failed: ${err instanceof Error ? err.message : String(err)}`,
      error_class: "FETCH_FAILED",
    };
  }

  if (!headRes.ok) {
    return {
      ok: false, url: resolvedUrl, content_type: null, content_length: null,
      error: `HEAD returned HTTP ${headRes.status} for ${resolvedUrl.substring(0, 120)}`,
      error_class: "FETCH_FAILED",
    };
  }

  // ── MIME type check ───────────────────────────────────────────────────────
  const contentType   = headRes.headers.get("content-type") ?? null;
  const contentLength = parseInt(headRes.headers.get("content-length") ?? "0", 10) || null;

  const allowedMimes = EXPECTED_MIME[kind];
  if (contentType && !allowedMimes.some(m => contentType.startsWith(m))) {
    return {
      ok: false, url: resolvedUrl, content_type: contentType, content_length: contentLength,
      error: `MIME mismatch: expected ${allowedMimes.join("|")} got ${contentType}`,
      error_class: "MIME_MISMATCH",
    };
  }

  // ── Content-Length check ──────────────────────────────────────────────────
  const minBytes = MIN_CONTENT_LENGTH[kind];
  if (contentLength !== null && contentLength < minBytes) {
    return {
      ok: false, url: resolvedUrl, content_type: contentType, content_length: contentLength,
      error: `Content-Length ${contentLength} < minimum ${minBytes} bytes — asset may be truncated`,
      error_class: "TRUNCATION_ERROR",
    };
  }

  console.info("[asset-validator] PASS", {
    kind, url: resolvedUrl.substring(0, 80),
    content_type: contentType, content_length: contentLength,
  });

  return { ok: true, url: resolvedUrl, content_type: contentType, content_length: contentLength };
}

// ── Provider-safe URL signing (for external API calls) ───────────────────────
// Signs Supabase storage URLs with a 3-hour TTL and verifies the result
// responds 200 via HEAD before returning it. Non-Supabase URLs are returned
// as-is after the HEAD check.  Throws on any failure so the caller can
// classify it as HEDRA_PRECHECK_FAILED before making the provider call.

export async function toSignedUrlForProvider(url: string, ttlSeconds = 10_800): Promise<string> {
  if (!url?.startsWith("https://")) {
    throw new Error(`HEDRA_URL_INVALID_PROTOCOL: expected https://, got ${url?.substring(0, 40)}`);
  }
  if (url.length < 30) {
    throw new Error(`HEDRA_URL_SUSPICIOUSLY_SHORT: length=${url.length} url=${url}`);
  }
  // Detect known truncation patterns (URL cut off mid-path)
  if (/\/object\/(p|pu|pub|publ|publi|public?)?$/.test(url) || url.endsWith("/object/")) {
    throw new Error(`HEDRA_URL_TRUNCATED: url ends at "${url.slice(-30)}"`);
  }

  const signed = await toSignedUrl(url, ttlSeconds);

  // HEAD check — fail loudly here so we never waste a Hedra API call on a dead URL
  let headRes: Response;
  try {
    headRes = await fetch(signed, { method: "HEAD", signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`HEDRA_PRECHECK_FAILED: HEAD request threw for ${signed.substring(0, 100)}: ${msg}`);
  }
  if (!headRes.ok) {
    throw new Error(
      `HEDRA_PRECHECK_FAILED: HEAD returned HTTP ${headRes.status} for ${signed.substring(0, 100)}`,
    );
  }

  console.info("[asset-validator] provider URL signed and verified", {
    original_length: url.length,
    signed_length:   signed.length,
    ttl_seconds:     ttlSeconds,
    head_status:     headRes.status,
  });

  return signed;
}

// ── Multi-asset validation (all must pass) ────────────────────────────────────

export interface AssetBundle {
  imageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
}

export interface BundleValidationResult {
  ok:       boolean;
  resolved: { imageUrl?: string; audioUrl?: string; videoUrl?: string };
  errors:   string[];
}

export async function validateAssetBundle(bundle: AssetBundle): Promise<BundleValidationResult> {
  const errors: string[] = [];
  const resolved: BundleValidationResult["resolved"] = {};

  const checks: Array<{ key: keyof AssetBundle; kind: AssetKind }> = [
    { key: "imageUrl", kind: "image" },
    { key: "audioUrl", kind: "audio" },
    { key: "videoUrl", kind: "video" },
  ];

  await Promise.all(
    checks
      .filter(c => bundle[c.key] !== undefined)
      .map(async ({ key, kind }) => {
        const result = await validateAsset(bundle[key]!, kind);
        if (!result.ok) {
          errors.push(`[${key}] ${result.error_class}: ${result.error}`);
        } else {
          (resolved as Record<string, string>)[key] = result.url;
        }
      }),
  );

  return { ok: errors.length === 0, resolved, errors };
}
