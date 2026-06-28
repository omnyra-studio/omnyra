/**
 * Retry Policy — Failure-proof generation with intelligent recovery
 *
 * Every error maps to a deterministic retry decision.
 * No silent failures. No infinite loops. No duplicate credits charged.
 *
 * Categories:
 *   transient_network  → immediate retry, same provider
 *   rate_limit         → backoff + retry, same provider
 *   provider_error     → exponential backoff + provider switch
 *   content_policy     → no retry (prompt rewrite needed)
 *   validation_failed  → retry with tightened prompt
 *   unrecoverable      → fail fast, surface error to user
 */

import type { RetryCategory, RetryDecision } from "./types";

// ── Error classification ───────────────────────────────────────────────────────

interface ClassifiedError {
  category:       RetryCategory;
  httpStatus?:    number;
  originalMessage: string;
}

export function classifyError(err: unknown): ClassifiedError {
  const message  = err instanceof Error ? err.message : String(err);
  const status   = (err as { status?: number }).status;

  // Network-level failures
  if (/fetch failed|ECONNRESET|ETIMEDOUT|network/i.test(message)) {
    return { category: "transient_network", originalMessage: message };
  }

  // Rate limiting
  if (status === 429 || /rate.?limit|too many requests/i.test(message)) {
    return { category: "rate_limit", httpStatus: 429, originalMessage: message };
  }

  // Provider-level 5xx
  if (status !== undefined && status >= 500) {
    return { category: "provider_error", httpStatus: status, originalMessage: message };
  }

  // Provider task failed (Runway/Kling task status = FAILED)
  if (/task.*failed|status=FAILED|CANCELLED/i.test(message)) {
    return { category: "provider_error", originalMessage: message };
  }

  // Content policy violations
  if (/content.?policy|moderation|inappropriate|safety/i.test(message)) {
    return { category: "content_policy", originalMessage: message };
  }

  // Validation failures (our internal checks)
  if (/validation.*fail|confidence|below.*threshold/i.test(message)) {
    return { category: "validation_failed", originalMessage: message };
  }

  // Auth / credential failures
  if (status === 401 || status === 403 || /api.?key|unauthorized|forbidden/i.test(message)) {
    return { category: "unrecoverable", httpStatus: status, originalMessage: message };
  }

  // Unknown — default to provider_error (retryable)
  return { category: "provider_error", originalMessage: message };
}

// ── Retry decision matrix ─────────────────────────────────────────────────────

export function getRetryDecision(
  err:            unknown,
  attemptNumber:  number,     // 1-based current attempt
  stage:          "image" | "clip" | "voice" | "assembly",
): RetryDecision {
  const { category, originalMessage } = classifyError(err);

  const STAGE_MAX_ATTEMPTS: Record<string, number> = {
    image:    3,
    clip:     2,
    voice:    2,
    assembly: 1, // assembly failure is unrecoverable without new clips
  };
  const maxAttempts = STAGE_MAX_ATTEMPTS[stage] ?? 2;

  switch (category) {
    case "transient_network":
      return {
        shouldRetry:    attemptNumber < maxAttempts,
        delayMs:        500 * attemptNumber,
        maxAttempts,
        category,
        switchProvider: false,
        reason:         `Network error on attempt ${attemptNumber}: ${originalMessage.slice(0, 80)}`,
      };

    case "rate_limit":
      return {
        shouldRetry:    attemptNumber < maxAttempts,
        delayMs:        3500 * attemptNumber,   // aggressive backoff for rate limits
        maxAttempts,
        category,
        switchProvider: attemptNumber >= 2,     // switch provider after first rate-limit retry
        reason:         `Rate limited on attempt ${attemptNumber}`,
      };

    case "provider_error":
      return {
        shouldRetry:    attemptNumber < maxAttempts,
        delayMs:        2000 * Math.pow(2, attemptNumber - 1), // exponential: 2s, 4s, 8s
        maxAttempts,
        category,
        switchProvider: attemptNumber >= maxAttempts - 1,
        reason:         `Provider error on attempt ${attemptNumber}: ${originalMessage.slice(0, 80)}`,
      };

    case "validation_failed":
      return {
        shouldRetry:    attemptNumber < maxAttempts,
        delayMs:        1000,
        maxAttempts,
        category,
        switchProvider: false,
        reason:         `Validation failed — retrying with tightened prompt`,
      };

    case "content_policy":
      return {
        shouldRetry:    false,
        delayMs:        0,
        maxAttempts,
        category,
        switchProvider: false,
        reason:         `Content policy violation — manual prompt review required`,
      };

    case "unrecoverable":
    default:
      return {
        shouldRetry:    false,
        delayMs:        0,
        maxAttempts,
        category,
        switchProvider: false,
        reason:         `Unrecoverable: ${originalMessage.slice(0, 120)}`,
      };
  }
}

// ── Retry executor ────────────────────────────────────────────────────────────
// Generic retry wrapper with policy enforcement.

export async function withRetry<T>(
  fn:    () => Promise<T>,
  stage: "image" | "clip" | "voice" | "assembly",
  label: string,
): Promise<T> {
  let lastErr: unknown;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const decision = getRetryDecision(err, attempt, stage);

      console.warn(
        `[RETRY] ${label} attempt=${attempt} category=${decision.category} ` +
        `shouldRetry=${decision.shouldRetry} delay=${decision.delayMs}ms`
      );

      if (!decision.shouldRetry) {
        console.error(`[RETRY] ${label} giving up: ${decision.reason}`);
        break;
      }

      if (decision.delayMs > 0) {
        await sleep(decision.delayMs);
      }
    }
  }

  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
