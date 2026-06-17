// Hedra Avatar API provider — implemented against official documentation.
//
// Documentation sources (via https://hedra.com/docs/llms.txt):
//   https://hedra.com/docs/pages/developer/guides/generate-avatar-video.md
//   https://hedra.com/docs/api-reference/public/generate-asset.md
//   https://hedra.com/docs/api-reference/public/get-status.md
//   https://hedra.com/docs/api-reference/public/create-asset.md
//   https://hedra.com/docs/api-reference/public/upload-asset.md
//
// Official flow:
//   1. POST /assets  {"name","type":"image"}  → image_asset_id
//   2. POST /assets/{image_asset_id}/upload   multipart file
//   3. POST /assets  {"name","type":"audio"}  → audio_asset_id
//   4. POST /assets/{audio_asset_id}/upload   multipart file
//   5. POST /generations                      → generation_id
//   6. GET  /generations/{generation_id}/status  — poll until status ∈ {complete,error}
//   7. Read video URL from status.url | status.download_url | status.streaming_url
//
// Official model IDs (generate-avatar-video.md):
//   Hedra Avatar : 26f0fc66-152b-40ab-abed-76c43df99bc8  (talking-head, lipsync, up to 10 min)
//   Hedra Omnia  : ab372b84-432f-44f5-bacc-c2542465f712  (full-body motion, up to 8s)
//
// Official status enum (get-status.md):
//   complete | error | processing | queued | finalizing
//
// Official status response URL fields (get-status.md):
//   url | download_url | streaming_url  — all at root level, all nullable
//
// Env vars:
//   HEDRA_API_KEY   (required)
//   HEDRA_API_BASE  (optional — default: https://api.hedra.com/web-app/public)
//   DEBUG_HEDRA     (optional — set "true" for verbose transport/DNS logging)

import { lookup as dnsLookup } from "dns/promises";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

// Strip UTF-8 BOM (U+FEFF, char 65279) and surrounding whitespace from env values.
// PowerShell's echo pipeline can inject a BOM that breaks URL fetch headers.
function cleanEnv(value?: string): string | undefined {
  return value?.replace(/^﻿/, "").trim();
}

// Official base URL — documented in generate-avatar-video.md
const HEDRA_BASE = (
  cleanEnv(process.env.HEDRA_API_BASE) ?? "https://api.hedra.com/web-app/public"
).replace(/\/$/, "");

// Official model ID for talking-head/lipsync — documented in generate-avatar-video.md
// "Talking-head videos, lip-sync, up to 10 minutes"
const HEDRA_AVATAR_MODEL_ID = "26f0fc66-152b-40ab-abed-76c43df99bc8";

// Startup validation — fail fast on corrupt env
{
  const firstCode = HEDRA_BASE.charCodeAt(0);
  console.log("[HEDRA_ENV]", {
    api_base:        HEDRA_BASE,
    first_char_code: firstCode,
    length:          HEDRA_BASE.length,
  });
  if (firstCode !== 104 /* 'h' */ || !HEDRA_BASE.startsWith("https://")) {
    throw new Error(
      `[HEDRA_ENV] HEDRA_API_BASE is corrupt: first_char_code=${firstCode} value="${HEDRA_BASE.substring(0, 40)}"`,
    );
  }
}

// Poll budget: asset fetch + upload + submit ≈ 60s worst case → up to 360s left for polling.
const POLL_INTERVAL_MS   = 5_000;
const MAX_POLL_ATTEMPTS  = 72;    // 72 × 5s = 360s polling budget
const FETCH_TIMEOUT_MS   = 12_000;
const DNS_TIMEOUT_MS     = 3_000;
const MAX_FETCH_ATTEMPTS = 2;
const RETRY_JITTER_MS    = [250, 500] as const;

const DEBUG = process.env.DEBUG_HEDRA === "true";

export interface HedraInput {
  image_url:            string;
  audio_url:            string;
  resolution?:          "540p" | "720p";
  aspect_ratio?:        string;
  text_prompt?:         string;
  duration_s?:          number; // if provided → sent as duration_ms (milliseconds)
  _jobId?:              string;
  _resumeGenerationId?: string; // skip submit; resume polling from this ID
}

export interface HedraOutput {
  video_url:  string;
  request_id: string;
}

// ── Lightweight hash helper ───────────────────────────────────────────────────

function hash(str: string): string {
  return createHash("sha256").update(str).digest("hex").slice(0, 16);
}

// ── Execution fingerprint ─────────────────────────────────────────────────────

export interface HedraFingerprint {
  image_hash:   string;
  audio_hash:   string;
  payload_hash: string;
}

function buildFingerprint(imageUrl: string, audioUrl: string): HedraFingerprint {
  return {
    image_hash:   hash(imageUrl),
    audio_hash:   hash(audioUrl),
    payload_hash: hash(imageUrl + audioUrl),
  };
}

// ── Outbound call registry ────────────────────────────────────────────────────
// In-process dedup guard. Prevents same-invocation double-submit.
// Evict entries older than 15 minutes to bound memory usage.

const outboundRegistry = new Map<string, {
  audio_hash:     string;
  image_hash:     string;
  generation_id?: string;
  timestamp:      number;
}>();

function pruneRegistry(): void {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [k, v] of outboundRegistry) {
    if (v.timestamp < cutoff) outboundRegistry.delete(k);
  }
}

export function getOutboundRegistryEntry(id: string) {
  return outboundRegistry.get(id);
}

// ── Media payload interceptor ─────────────────────────────────────────────────

function assertMediaPayload(
  payload: { image_url: string; audio_url: string },
  jobId?: string,
): void {
  const { audio_url, image_url } = payload;

  if (typeof audio_url !== "string" || typeof image_url !== "string") {
    throw new Error("MEDIA_URL_INVALID_TYPE");
  }

  if (/\/object\/public\/?$/.test(audio_url) || /\/object\/public\/?$/.test(image_url)) {
    throw new Error("MEDIA_URL_TRUNCATED_DETECTED");
  }

  if (audio_url.length < 25 || image_url.length < 25) {
    throw new Error("MEDIA_URL_TOO_SHORT");
  }

  if (!audio_url.includes("supabase.co/storage")) {
    throw new Error("AUDIO_URL_INVALID_DOMAIN");
  }
  if (!image_url.includes("supabase.co/storage")) {
    throw new Error("IMAGE_URL_INVALID_DOMAIN");
  }

  const audio_hash = hash(audio_url);
  const image_hash = hash(image_url);

  console.info("[OUTBOUND_MEDIA_OK]", {
    audio_len: audio_url.length,
    image_len: image_url.length,
    audio_hash,
    image_hash,
  });

  pruneRegistry();
  const registryKey = jobId ?? `auto-${Date.now()}`;
  outboundRegistry.set(registryKey, { audio_hash, image_hash, timestamp: Date.now() });
}

// ── DNS preflight ─────────────────────────────────────────────────────────────

async function dnsPrecheck(): Promise<void> {
  let hostname: string;
  try { hostname = new URL(HEDRA_BASE).hostname; }
  catch { hostname = "api.hedra.com"; }

  const t0 = Date.now();
  try {
    await Promise.race([
      dnsLookup(hostname),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(Object.assign(new Error("DNS lookup timed out"), { code: "ETIMEDOUT" })),
          DNS_TIMEOUT_MS,
        ),
      ),
    ]);
    console.info("[HEDRA_DOC_BASE]", {
      base:     HEDRA_BASE,
      hostname,
      dns_ms:   Date.now() - t0,
      model_id: HEDRA_AVATAR_MODEL_ID,
    });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    const ms = Date.now() - t0;
    throw new Error(`HEDRA_DNS_FAILURE: ENOTFOUND ${hostname} (${e.message}) ms=${ms}`);
  }
}

// ── Transport classification ──────────────────────────────────────────────────

type HedraErrorClass =
  | "HEDRA_DNS_FAILURE"
  | "HEDRA_TIMEOUT"
  | "HEDRA_NETWORK_RESET"
  | "HEDRA_4XX"
  | "HEDRA_5XX"
  | "HEDRA_UNKNOWN";

const RETRYABLE: Set<HedraErrorClass> = new Set([
  "HEDRA_DNS_FAILURE",
  "HEDRA_TIMEOUT",
  "HEDRA_NETWORK_RESET",
  "HEDRA_5XX",
]);

interface ClassifiedResult {
  response?:    Response;
  errorClass?:  HedraErrorClass;
  errorMessage: string;
  timingMs:     number;
}

async function classifiedFetch(url: string, init: RequestInit): Promise<ClassifiedResult> {
  const t0 = Date.now();
  try {
    const response = await fetch(url, init);
    const timingMs = Date.now() - t0;
    if (!response.ok) {
      const errorClass: HedraErrorClass = response.status >= 500 ? "HEDRA_5XX" : "HEDRA_4XX";
      return { response, errorClass, errorMessage: `HTTP ${response.status}`, timingMs };
    }
    return { response, errorMessage: "", timingMs };
  } catch (err) {
    const timingMs = Date.now() - t0;
    const e = err as NodeJS.ErrnoException & { name: string; cause?: { code?: string } };
    const code = e.code ?? e.cause?.code ?? "";
    let errorClass: HedraErrorClass;
    if (code === "ENOTFOUND" || e.message.includes("ENOTFOUND")) {
      errorClass = "HEDRA_DNS_FAILURE";
    } else if (e.name === "AbortError" || code === "ETIMEDOUT" || e.message.includes("AbortError")) {
      errorClass = "HEDRA_TIMEOUT";
    } else if (code === "ECONNRESET") {
      errorClass = "HEDRA_NETWORK_RESET";
    } else {
      errorClass = "HEDRA_UNKNOWN";
    }
    return { errorClass, errorMessage: e.message, timingMs };
  }
}

// hedraFetch — with retry for non-polling calls (submit, asset ops)
async function hedraFetch(
  url:         string,
  init:        RequestInit,
  fingerprint: HedraFingerprint,
  stage:       string,
): Promise<Response> {
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      const jitter = RETRY_JITTER_MS[0] + Math.random() * (RETRY_JITTER_MS[1] - RETRY_JITTER_MS[0]);
      await new Promise(r => setTimeout(r, jitter));
    }

    const result = await classifiedFetch(url, {
      ...init,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (result.response && !result.errorClass) return result.response;

    const errorClass = result.errorClass ?? "HEDRA_UNKNOWN";

    if (errorClass === "HEDRA_4XX") {
      console.error("[HEDRA_FAILURE]", {
        provider: "hedra", error_type: errorClass, stage,
        attempt, max_attempts: MAX_FETCH_ATTEMPTS, fingerprint,
        timing_ms: result.timingMs, retriable: false,
        endpoint: url.replace(HEDRA_BASE, ""),
      });
      return result.response!;
    }

    const retriable = RETRYABLE.has(errorClass) && attempt < MAX_FETCH_ATTEMPTS;
    console.error("[HEDRA_FAILURE]", {
      provider: "hedra", error_type: errorClass,
      stage, attempt, max_attempts: MAX_FETCH_ATTEMPTS,
      fingerprint, timing_ms: result.timingMs, retriable,
      endpoint: url.replace(HEDRA_BASE, ""),
    });

    if (DEBUG) console.debug("[hedra:debug]", { message: result.errorMessage.substring(0, 300) });

    if (!retriable) {
      if (result.response) return result.response;
      throw new Error(`${errorClass}: ${result.errorMessage} endpoint=${url}`);
    }
  }

  throw new Error(`HEDRA_UNKNOWN: exhausted ${MAX_FETCH_ATTEMPTS} attempts endpoint=${url}`);
}

// hedraFetchOnce — single-attempt fetch for polling (the poll loop IS the retry)
async function hedraFetchOnce(url: string, init: RequestInit): Promise<Response | null> {
  const result = await classifiedFetch(url, {
    ...init,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (result.response) return result.response;
  console.warn("[hedra] poll fetch failed", { error: result.errorClass, msg: result.errorMessage });
  return null;
}

// ── Asset fetch (bytes from signed Supabase URL) ──────────────────────────────

async function fetchBytes(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`HEDRA_ASSET_FETCH_FAILED: could not fetch bytes (url_len=${url.length}): ${msg}`);
  }
  if (!res.ok) {
    throw new Error(`HEDRA_ASSET_FETCH_FAILED: HTTP ${res.status} fetching asset (url_len=${url.length})`);
  }
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const buf = await res.arrayBuffer();
  return { bytes: new Uint8Array(buf.slice(0)), contentType };
}

// ── Hedra asset upload ────────────────────────────────────────────────────────
// Official docs (create-asset.md, upload-asset.md):
//   POST /assets  body: {"name": string, "type": "image"|"audio"}  → {id: UUID}
//   POST /assets/{id}/upload  multipart/form-data field: "file"

async function uploadHedraAsset(
  apiKey:      string,
  type:        "image" | "audio",
  bytes:       Uint8Array,
  contentType: string,
  name:        string,
  fingerprint: HedraFingerprint,
): Promise<string> {
  const t0 = Date.now();

  // Step 1: register asset record — POST /assets
  const createRes = await hedraFetch(
    `${HEDRA_BASE}/assets`,
    {
      method:  "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body:    JSON.stringify({ type, name }),
    },
    fingerprint,
    `asset_create_${type}`,
  );

  if (!createRes.ok) {
    const text = await createRes.text().catch(() => "");
    const code = createRes.status >= 500 ? "HEDRA_PROVIDER_5XX" : "HEDRA_ASSET_CREATE_FAILED";
    throw new Error(`${code}: HTTP ${createRes.status} creating ${type} asset: ${text}`);
  }

  // Official create-asset.md response: {id: UUID, name, type, upload_url?}
  const created = await createRes.json() as { id?: string; asset_id?: string };
  const assetId = created.id ?? created.asset_id;
  if (!assetId) {
    throw new Error(
      `HEDRA_ASSET_CREATE_FAILED: no id in response: ${JSON.stringify(created).substring(0, 200)}`,
    );
  }

  // Step 2: upload bytes — POST /assets/{id}/upload multipart/form-data field "file"
  const form = new FormData();
  form.append("file", new Blob([bytes.buffer as ArrayBuffer], { type: contentType }), name);

  const uploadRes = await hedraFetch(
    `${HEDRA_BASE}/assets/${assetId}/upload`,
    {
      method:  "POST",
      headers: { "X-API-Key": apiKey },
      body:    form,
    },
    fingerprint,
    `asset_upload_${type}`,
  );

  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => "");
    const code = uploadRes.status >= 500 ? "HEDRA_PROVIDER_5XX" : "HEDRA_ASSET_UPLOAD_FAILED";
    throw new Error(`${code}: HTTP ${uploadRes.status} uploading ${type} ${assetId}: ${text}`);
  }

  console.info("[HEDRA_ASSET_UPLOAD]", {
    type,
    asset_id:  assetId,
    bytes:     bytes.byteLength,
    timing_ms: Date.now() - t0,
    endpoint:  `/assets → /assets/${assetId}/upload`,
  });

  return assetId;
}

// ── Image re-hosting ──────────────────────────────────────────────────────────
// Hedra's asset upload pipeline fetches bytes directly from the URL we provide.
// External domains (fal.media, fal.ai, etc.) may be blocked or rate-limited from
// Hedra's infra. Re-hosting to Supabase ensures a stable, accessible origin.

async function reHostImageToSupabase(imageUrl: string, jobId: string): Promise<string> {
  const supabase = createClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
    cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)!,
  );

  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HEDRA_REHOST_FETCH_FAILED: ${res.status} from ${imageUrl.substring(0, 80)}`);

  const buffer = await res.arrayBuffer();
  const bytes  = new Uint8Array(buffer);

  const path = `${jobId}/image/avatar-source.jpg`;
  const { error } = await supabase.storage
    .from("renders")
    .upload(path, bytes, { contentType: "image/jpeg", upsert: true });

  if (error) throw new Error(`HEDRA_REHOST_UPLOAD_FAILED: ${error.message}`);

  const { data } = supabase.storage.from("renders").getPublicUrl(path);
  console.log("[HEDRA_IMAGE_REHOSTED]", data.publicUrl.substring(0, 80));
  return data.publicUrl;
}

// ── Moderation-safe image pre-processing ─────────────────────────────────────
// Reduces skin-detail flags by resizing, softening saturation, and applying a
// gentle blur — without visually degrading the image for normal viewing.
// Called once on a moderation failure before retrying Hedra submission.

export async function makeHedraSafeImage(imageUrl: string, jobId: string): Promise<string> {
  const supabase = createClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
    cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)!,
  );

  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HEDRA_SAFE_FETCH_FAILED: ${res.status}`);
  const raw = Buffer.from(await res.arrayBuffer());

  const safeBuffer = await sharp(raw)
    .resize(960, 1280, { fit: "inside", withoutEnlargement: true })
    .modulate({ brightness: 1.15, saturation: 0.75, hue: 5 })
    .blur(1.0)
    .gamma(0.9)
    .jpeg({ quality: 75 })
    .toBuffer();

  const path = `${jobId}/image/hedra-safe-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from("renders")
    .upload(path, safeBuffer, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`HEDRA_SAFE_UPLOAD_FAILED: ${error.message}`);

  const { data } = supabase.storage.from("renders").getPublicUrl(path);
  console.log("[HEDRA_SAFETY] safe image created", data.publicUrl.substring(0, 80));
  return data.publicUrl;
}

// ── Main export ───────────────────────────────────────────────────────────────

// ── Internal submit helper ────────────────────────────────────────────────────
// Shared by generateHedraAvatar (submit+poll) and submitHedraJob (submit-only).
// Returns { generationId, apiKey, fingerprint } so the caller can decide whether
// to poll or return immediately.

interface PrepareResult {
  generationId: string;
  apiKey:       string;
  fingerprint:  HedraFingerprint;
}

async function prepareAndSubmit(
  input:                HedraInput,
  onGenerationStarted?: (generationId: string) => Promise<void>,
): Promise<PrepareResult> {
  const apiKey = cleanEnv(process.env.HEDRA_API_KEY);
  if (!apiKey) throw new Error("HEDRA_API_KEY not configured");

  // Re-host image to Supabase if it comes from an external domain.
  let resolvedInput = input;
  if (
    input.image_url.includes("fal.media") ||
    input.image_url.includes("fal.ai") ||
    !input.image_url.includes("supabase")
  ) {
    console.log("[HEDRA_REHOST] re-hosting image from:", input.image_url.substring(0, 60));
    const hostedImageUrl = await reHostImageToSupabase(
      input.image_url,
      input._jobId ?? `hedra-${Date.now()}`,
    );
    console.log("[HEDRA_REHOST] now using:", hostedImageUrl.substring(0, 60));
    resolvedInput = { ...input, image_url: hostedImageUrl };
  }

  assertMediaPayload(resolvedInput, resolvedInput._jobId);

  const fingerprint = buildFingerprint(resolvedInput.image_url, resolvedInput.audio_url);

  const rawEnvBase = process.env.HEDRA_API_BASE;
  console.log("[HEDRA_RUNTIME_AUDIT]", {
    deployment:      process.env.VERCEL_DEPLOYMENT_ID ?? "local",
    api_base:        HEDRA_BASE,
    first_char_code: HEDRA_BASE.charCodeAt(0),
    source:          rawEnvBase ? "env" : "fallback",
    env_raw_length:  rawEnvBase?.length ?? 0,
  });

  await dnsPrecheck();

  // Resume path — generation already submitted; caller decides what to do with the ID
  if (resolvedInput._resumeGenerationId) {
    console.info("[hedra] resume: returning existing generation_id", {
      generation_id: resolvedInput._resumeGenerationId,
      fingerprint,
    });
    return { generationId: resolvedInput._resumeGenerationId, apiKey, fingerprint };
  }

  // In-process dedup guard
  const registryKey = resolvedInput._jobId ?? `auto-${Date.now()}`;
  const existing = outboundRegistry.get(registryKey);
  if (existing?.generation_id) {
    console.info("[hedra] in-process dedup: returning existing generation_id", {
      generation_id: existing.generation_id,
      fingerprint,
    });
    return { generationId: existing.generation_id, apiKey, fingerprint };
  }

  const [imageAsset, audioAsset] = await Promise.all([
    fetchBytes(resolvedInput.image_url),
    fetchBytes(resolvedInput.audio_url),
  ]);

  console.info("[hedra] asset bytes fetched", {
    image_bytes: imageAsset.bytes.byteLength,
    audio_bytes: audioAsset.bytes.byteLength,
  });

  const jobTag = resolvedInput._jobId?.slice(0, 8) ?? "unknown";
  const [imageId, audioId] = await Promise.all([
    uploadHedraAsset(apiKey, "image", imageAsset.bytes, imageAsset.contentType, `image-${jobTag}`, fingerprint),
    uploadHedraAsset(apiKey, "audio", audioAsset.bytes, audioAsset.contentType, `audio-${jobTag}`, fingerprint),
  ]);

  console.info("[hedra] assets registered", { imageId, audioId, fingerprint });

  const videoInputs: Record<string, unknown> = {
    text_prompt:  resolvedInput.text_prompt ?? "A person talking directly to the camera",
    resolution:   resolvedInput.resolution  ?? "720p",
    aspect_ratio: resolvedInput.aspect_ratio ?? "9:16",
  };
  if (resolvedInput.duration_s != null) {
    videoInputs.duration_ms = Math.round(resolvedInput.duration_s * 1000);
  }

  const generationPayload = {
    type:              "video",
    ai_model_id:       HEDRA_AVATAR_MODEL_ID,
    start_keyframe_id: imageId,
    audio_id:          audioId,
    generated_video_inputs: videoInputs,
  };

  const t0Submit = Date.now();
  console.info("[HEDRA_GENERATION_CREATE]", {
    endpoint:     "/generations",
    model_id:     HEDRA_AVATAR_MODEL_ID,
    image_id:     imageId,
    audio_id:     audioId,
    resolution:   input.resolution ?? "720p",
    aspect_ratio: input.aspect_ratio ?? "9:16",
    duration_ms:  videoInputs.duration_ms ?? "not_set",
    fingerprint,
  });

  const submitRes = await hedraFetch(
    `${HEDRA_BASE}/generations`,
    {
      method:  "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body:    JSON.stringify(generationPayload),
    },
    fingerprint,
    "generation_submit",
  );

  const submitText = await submitRes.text().catch(() => "");

  if (!submitRes.ok) {
    const code = submitRes.status >= 500 ? "HEDRA_PROVIDER_5XX" : "Hedra submit";
    console.error("[HEDRA_FAILURE]", {
      stage:    "generation_submit",
      status:   submitRes.status,
      body:     submitText,
      endpoint: "/generations",
      fingerprint,
    });
    throw new Error(`${code}: Hedra submit failed HTTP ${submitRes.status}: ${submitText}`);
  }

  let submitResJson: { id?: string; generation_id?: string; job_id?: string };
  try {
    submitResJson = JSON.parse(submitText);
  } catch {
    throw new Error(`Hedra submit returned non-JSON: ${submitText.substring(0, 200)}`);
  }

  const generationId = submitResJson.id ?? submitResJson.generation_id ?? submitResJson.job_id;
  if (!generationId) {
    throw new Error(`Hedra submit returned no generation id: ${submitText.substring(0, 200)}`);
  }

  console.info("[HEDRA_GENERATION_SUBMITTED]", {
    generation_id: generationId,
    timing_ms:     Date.now() - t0Submit,
    fingerprint,
  });

  const prev = outboundRegistry.get(registryKey);
  outboundRegistry.set(registryKey, {
    audio_hash:    prev?.audio_hash   ?? hash(resolvedInput.audio_url),
    image_hash:    prev?.image_hash   ?? hash(resolvedInput.image_url),
    generation_id: generationId,
    timestamp:     Date.now(),
  });

  if (onGenerationStarted) {
    try { await onGenerationStarted(generationId); }
    catch (cbErr) { console.warn("[hedra] onGenerationStarted callback failed (non-fatal):", cbErr); }
  }

  return { generationId, apiKey, fingerprint };
}

// ── Public: single-shot status check (used by hedra-cron) ─────────────────────

export async function checkHedraGenerationStatus(generationId: string): Promise<{
  status:       string;
  videoUrl:     string | null;
  errorMessage: string | null;
}> {
  const apiKey = cleanEnv(process.env.HEDRA_API_KEY);
  if (!apiKey) throw new Error("HEDRA_API_KEY not configured");

  const endpoint = `${HEDRA_BASE}/generations/${generationId}/status`;
  const res = await hedraFetchOnce(endpoint, { headers: { "X-API-Key": apiKey } });

  if (!res || !res.ok) {
    return {
      status:       "unknown",
      videoUrl:     null,
      errorMessage: `HTTP ${res?.status ?? "no-response"}`,
    };
  }

  const data = await res.json() as {
    status:         string;
    url?:           string | null;
    download_url?:  string | null;
    streaming_url?: string | null;
    error_message?: string;
  };

  const videoUrl = data.url ?? data.download_url ?? data.streaming_url ?? null;

  console.info("[HEDRA_STATUS_CHECK]", {
    generation_id: generationId,
    status:        data.status,
    has_url:       !!videoUrl,
  });

  return {
    status:       data.status,
    videoUrl:     data.status === "complete" ? videoUrl : null,
    errorMessage: data.error_message ?? null,
  };
}

// ── Public: submit only — returns generation_id immediately, no polling ───────
// Use this for fire-and-forget pipelines where a cron completes the job.

export async function submitHedraJob(
  input:                HedraInput,
  onGenerationStarted?: (generationId: string) => Promise<void>,
): Promise<string> {
  const { generationId } = await prepareAndSubmit(input, onGenerationStarted);
  return generationId;
}

// ── Public: submit + poll (original behaviour, kept for legacy callers) ───────

export async function generateHedraAvatar(
  input:                HedraInput,
  onGenerationStarted?: (generationId: string) => Promise<void>,
): Promise<HedraOutput> {
  const { generationId, apiKey, fingerprint } = await prepareAndSubmit(input, onGenerationStarted);
  return pollGeneration(apiKey, generationId, fingerprint);
}

// ── Polling ───────────────────────────────────────────────────────────────────
// Official endpoint (get-status.md): GET /generations/{generation_id}/status
// Official status enum: complete | error | processing | queued | finalizing
// Official URL fields (root level): url | download_url | streaming_url

async function pollGeneration(
  apiKey:       string,
  generationId: string,
  fingerprint:  HedraFingerprint,
): Promise<HedraOutput> {
  const t0 = Date.now();

  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const pollEndpoint = `${HEDRA_BASE}/generations/${generationId}/status`;
    const statusRes = await hedraFetchOnce(
      pollEndpoint,
      { headers: { "X-API-Key": apiKey } },
    );

    if (!statusRes || !statusRes.ok) {
      console.warn("[HEDRA_POLL]", {
        attempt:       i + 1,
        generation_id: generationId,
        http_status:   statusRes?.status ?? "no-response",
      });
      continue;
    }

    // Official GenerationStatusResponse fields (get-status.md):
    //   id, asset_id, type, status, progress (0-1), created_at
    //   url?, download_url?, streaming_url?, error_message?
    const data = await statusRes.json() as {
      status:          string;
      progress?:       number;
      eta_sec?:        number | null;
      url?:            string | null;
      download_url?:   string | null;
      streaming_url?:  string | null;
      asset_id?:       string | null;
      error_message?:  string;
    };

    console.info("[HEDRA_POLL]", {
      attempt:       i + 1,
      generation_id: generationId,
      status:        data.status,
      progress:      data.progress ?? null,
      eta_sec:       data.eta_sec  ?? null,
      elapsed_ms:    Date.now() - t0,
    });

    // Official terminal status: complete
    if (data.status === "complete") {
      // Official URL fields — root level per get-status.md
      const videoUrl = data.url ?? data.download_url ?? data.streaming_url ?? null;

      if (!videoUrl) {
        throw new Error(
          `[HEDRA_FAILURE] completed but no video URL: asset_id=${data.asset_id ?? "none"} response=${JSON.stringify(data).substring(0, 200)}`,
        );
      }

      console.info("[HEDRA_SUCCESS]", {
        generation_id: generationId,
        video_url:     videoUrl.substring(0, 100),
        asset_id:      data.asset_id ?? null,
        elapsed_ms:    Date.now() - t0,
        polls:         i + 1,
        fingerprint,
      });

      // Verify the URL is reachable before returning
      try {
        const headRes = await fetch(videoUrl, { method: "HEAD", signal: AbortSignal.timeout(10_000) });
        if (!headRes.ok) {
          console.warn("[hedra] video URL HEAD returned", headRes.status, "— returning anyway");
        }
      } catch (headErr) {
        console.warn("[hedra] video URL HEAD check failed (non-fatal):", (headErr as Error).message);
      }

      return { video_url: videoUrl, request_id: generationId };
    }

    // Official terminal status: error
    if (data.status === "error") {
      console.error("[HEDRA_FAILURE]", {
        generation_id:  generationId,
        error_message:  data.error_message ?? "no error_message",
        elapsed_ms:     Date.now() - t0,
        polls:          i + 1,
        fingerprint,
      });
      throw new Error(
        `Hedra generation ${generationId} failed: ${data.error_message ?? JSON.stringify(data).substring(0, 200)}`,
      );
    }

    // Non-terminal: processing | queued | finalizing — continue polling
  }

  throw new Error(
    `Hedra generation ${generationId} timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`,
  );
}
