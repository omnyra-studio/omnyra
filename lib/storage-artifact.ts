import { createHash } from "crypto";
import { supabaseAdmin } from "./supabase/admin";

const BUCKET = "renders";

// ── Error types ────────────────────────────────────────────────────────────────

export class StorageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageValidationError";
  }
}

// ── Params ─────────────────────────────────────────────────────────────────────

export interface ArtifactUploadParams {
  jobId:        string;
  stage:        string;
  buffer:       ArrayBuffer | ArrayBufferView;  // accepts Buffer, Uint8Array, ArrayBuffer
  contentType:  string;
  extension:    string;
  modelVersion: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Normalize any binary data representation to Uint8Array.
 * Node.js Buffer is a Uint8Array subclass — handled by the first branch.
 * ArrayBufferView (DataView, Float32Array, etc.) handled by second branch.
 * Raw ArrayBuffer handled by last branch.
 */
function normalizeBuffer(data: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return new Uint8Array(data as ArrayBuffer);
}

function byteLength(data: ArrayBuffer | ArrayBufferView): number {
  return ArrayBuffer.isView(data)
    ? data.byteLength
    : (data as ArrayBuffer).byteLength;
}

// ── Upload ─────────────────────────────────────────────────────────────────────

/**
 * Content-addressed, idempotent artifact upload.
 *
 * Steps:
 *   1. Validate payload — must be binary and non-empty (blocked before network)
 *   2. Path guard — reject bucket-prefix duplication and leading slashes
 *   3. Ledger-first resolution — return cached URL if stage already completed
 *   4. Compute deterministic content hash: sha256(bytes + jobId + stage + modelVersion)[0..48]
 *   5. Build storage path: {jobId}/{stage}/{hash}.{extension}  (no bucket prefix, no leading slash)
 *   6. Upload with upsert=true (safe to retry on partial failure)
 *   7. Return public URL — caller writes to ledger via completeLedgerEntry
 *
 * Throws StorageValidationError for invalid payloads (do not retry these).
 * Throws Error for transient upload failures (safe to retry).
 *
 * All failures are logged with full context: jobId, stage, bucket, path, bytes.
 */
export async function uploadArtifact({
  jobId,
  stage,
  buffer,
  contentType,
  extension,
  modelVersion,
}: ArtifactUploadParams): Promise<string> {
  const ctx = `[storage-artifact] job=${jobId} stage=${stage}`;

  // ── Step 1: Validate payload ───────────────────────────────────────────────
  const bytes = byteLength(buffer);
  if (!buffer || bytes === 0) {
    const msg = `${ctx} VALIDATION_FAILED bytes=${bytes} contentType=${contentType} — buffer is empty`;
    console.error(msg);
    throw new StorageValidationError(msg);
  }

  const uint8 = normalizeBuffer(buffer);

  // ── Step 2: Ledger-first resolution ───────────────────────────────────────
  const { data: ledger } = await supabaseAdmin
    .from("avatar_stage_ledger")
    .select("output_url")
    .eq("job_id", jobId)
    .eq("stage", stage)
    .eq("status", "completed")
    .maybeSingle();

  if (ledger?.output_url) {
    console.log(`${ctx} LEDGER_HIT — returning cached url`);
    return ledger.output_url;
  }

  // ── Step 3: Deterministic content hash ────────────────────────────────────
  const contentHash = createHash("sha256")
    .update(Buffer.from(uint8))
    .update(jobId)
    .update(stage)
    .update(modelVersion)
    .digest("hex")
    .substring(0, 48);

  // ── Step 4: Build and guard storage path ──────────────────────────────────
  const storagePath = `${jobId}/${stage}/${contentHash}.${extension}`;

  // Block the two most common causes of Supabase 400:
  //   a) leading slash  → /object/bucket//path → 400
  //   b) bucket in path → /object/bucket/bucket/path → 400
  if (storagePath.startsWith("/") || storagePath.startsWith(`${BUCKET}/`)) {
    const msg = `${ctx} INVALID_PATH — path must not start with "/" or bucket name; got "${storagePath}"`;
    console.error(msg);
    throw new StorageValidationError(msg);
  }

  // ── Step 5: Idempotent upload ──────────────────────────────────────────────
  console.log(`${ctx} UPLOADING bytes=${uint8.byteLength} bucket=${BUCKET} path=${storagePath}`);

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, uint8, { contentType, upsert: true });

  if (uploadErr) {
    const msg = `${ctx} UPLOAD_FAILED bucket=${BUCKET} path=${storagePath} bytes=${uint8.byteLength} — ${uploadErr.message}`;
    console.error(msg);
    throw new Error(msg);
  }

  // ── Step 6: Return public URL ──────────────────────────────────────────────
  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);

  console.log(`${ctx} UPLOAD_OK url=${publicUrl.substring(0, 100)}`);
  console.log(`${ctx} UPLOAD_DETAILS bucket=${BUCKET} path=${storagePath} public_url=${publicUrl} bytes=${uint8.byteLength} content_type=${contentType}`);

  // Phase 3: Confirm object actually exists in bucket after upload
  try {
    const dir = storagePath.substring(0, storagePath.lastIndexOf("/"));
    const { data: objects } = await supabaseAdmin.storage.from(BUCKET).list(dir);
    const found = (objects ?? []).find((o) => storagePath.endsWith(o.name));
    if (found) {
      const meta = found.metadata as { size?: number; mimetype?: string } | undefined;
      console.log(`${ctx} OBJECT_EXISTS name=${found.name} size=${meta?.size ?? "unknown"} mime=${meta?.mimetype ?? "unknown"}`);
    } else {
      console.error(`${ctx} OBJECT_MISSING — upload reported success but object not found bucket=${BUCKET} path=${storagePath}`);
    }
  } catch (listErr) {
    const msg = listErr instanceof Error ? listErr.message : String(listErr);
    console.error(`${ctx} OBJECT_LIST ERROR: ${msg}`);
  }

  // Phase 1: Probe whether the URL is publicly accessible (fal.ai / external services will do the same)
  try {
    const headRes = await fetch(publicUrl, { method: "HEAD" });
    const headStatus = headRes.status;
    const headLen    = headRes.headers.get("content-length") ?? "none";
    const headType   = headRes.headers.get("content-type")   ?? "none";
    console.log(`${ctx} HEAD_PROBE status=${headStatus} content-length=${headLen} content-type=${headType} url=${publicUrl}`);
    if (!headRes.ok) {
      console.error(`${ctx} HEAD_PROBE FAILED status=${headStatus} bucket=${BUCKET} path=${storagePath} — bucket is private or RLS blocks public reads`);
    }
  } catch (headErr) {
    const msg = headErr instanceof Error ? headErr.message : String(headErr);
    console.error(`${ctx} HEAD_PROBE ERROR: ${msg} url=${publicUrl}`);
  }

  return publicUrl;
}

// ── Storage existence check ────────────────────────────────────────────────────

/**
 * Return true if at least one object exists under {jobId}/{stage}/ in the bucket.
 * Used by Pass 5 consensus to verify completed ledger entries have real artifacts.
 */
export async function storageArtifactExists(
  jobId: string,
  stage: string,
): Promise<boolean> {
  const { data } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(`${jobId}/${stage}`);
  return (data ?? []).length > 0;
}
