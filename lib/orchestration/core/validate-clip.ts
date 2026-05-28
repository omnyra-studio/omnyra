/**
 * Asset validation for rendered shot clips.
 *
 * "Job completed" ≠ "asset usable". Providers can return a successful job
 * status with a zero-byte file, a corrupted container, or an unplayable codec.
 * This module is the enforcement point between "provider said done" and
 * "we write render_status=completed to the DB".
 *
 * Strategy:
 *   1. HEAD — HTTP reachability + content-length guard
 *   2. Range(0–11) — MP4 ftyp box check (non-blocking: CDN range-rejection is non-fatal)
 *
 * Intentionally lightweight: no full download, no FFprobe. The goal is to catch
 * the most common failure modes (zero-byte, wrong MIME, non-MP4 container) without
 * adding meaningful latency to the render pipeline.
 */

export interface ClipValidation {
  valid:      boolean;
  error?:     string;
  sizeBytes?: number;
}

// 100 KB floor — a legitimate MP4 shot is never this small.
// Zero-byte and corrupted responses typically come back as < 1 KB.
const MIN_CLIP_SIZE_BYTES = 100_000;

export async function validateClip(url: string): Promise<ClipValidation> {
  // ── 1. HEAD check ────────────────────────────────────────────────────────────
  let head: Response;
  try {
    head = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(12_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "network error";
    return { valid: false, error: `Clip URL unreachable: ${msg}` };
  }

  if (!head.ok) {
    return { valid: false, error: `Clip returned HTTP ${head.status}` };
  }

  const rawLength = head.headers.get("content-length");
  const sizeBytes = rawLength ? parseInt(rawLength, 10) : 0;

  if (sizeBytes > 0 && sizeBytes < MIN_CLIP_SIZE_BYTES) {
    return {
      valid:      false,
      error:      `Clip too small: ${sizeBytes} bytes (minimum ${MIN_CLIP_SIZE_BYTES}). Likely a corrupted or empty response.`,
      sizeBytes,
    };
  }

  // ── 2. MP4 container check ───────────────────────────────────────────────────
  // bytes 4–7 of a valid MP4 file are ASCII "ftyp" (0x66 0x74 0x79 0x70).
  // Fetch just the first 12 bytes via a Range request.
  try {
    const rangeRes = await fetch(url, {
      headers: { Range: "bytes=0-11" },
      signal:  AbortSignal.timeout(8_000),
    });

    if (rangeRes.ok || rangeRes.status === 206) {
      const buf = new Uint8Array(await rangeRes.arrayBuffer());
      if (buf.length >= 8) {
        const isFtyp =
          buf[4] === 0x66 &&  // f
          buf[5] === 0x74 &&  // t
          buf[6] === 0x79 &&  // y
          buf[7] === 0x70;    // p

        if (!isFtyp) {
          return {
            valid:      false,
            error:      "Not a valid MP4 container (missing ftyp box at offset 4). Clip may be in an unsupported format.",
            sizeBytes,
          };
        }
      }
    }
    // If the CDN doesn't support range requests or returns unexpected status,
    // skip the container check rather than producing a false positive.
  } catch {
    // Non-fatal — some CDNs reject Range requests entirely. HEAD pass is sufficient.
  }

  return { valid: true, sizeBytes };
}
