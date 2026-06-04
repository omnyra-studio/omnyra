// Failure Taxonomy
// Classifies pipeline errors into actionable failure types with recovery hints.
// Every thrown error must map to exactly one FailureCode.

export type FailureCode =
  | "FETCH_FAILED"             // Network/HTTP failure fetching an asset or calling a provider
  | "TRUNCATION_ERROR"         // Asset smaller than expected — serialization or upload bug
  | "MIME_MISMATCH"            // Content-Type doesn't match expected kind
  | "MODEL_REJECTION"          // Provider rejected the job (bad input, quota, policy)
  | "MOTION_INCONSISTENCY"     // Video output shows anatomy/motion artifacts (post-validation)
  | "TIMEOUT"                  // Job exceeded maximum wait time
  | "AUTH_FAILURE"             // Missing or invalid API key
  | "HEDRA_NETWORK_ERROR"      // TCP/DNS failure reaching Hedra — endpoint or firewall issue
  | "HEDRA_INVALID_URL"        // URL failed pre-flight validation before Hedra call
  | "HEDRA_PRECHECK_FAILED"    // HEAD check on media asset returned non-200
  | "HEDRA_PROVIDER_5XX"       // Hedra API returned 5xx server error
  | "HEDRA_ASSET_FAILED"       // Asset create/upload to Hedra failed
  | "PIPELINE_ERROR";          // Catch-all for unclassified internal errors

export interface ClassifiedFailure {
  code:       FailureCode;
  message:    string;
  retryable:  boolean;
  hint:       string;
}

// ── Classification rules ──────────────────────────────────────────────────────

const PATTERNS: Array<{
  test:      (msg: string) => boolean;
  code:      FailureCode;
  retryable: boolean;
  hint:      string;
}> = [
  // ── Hedra-specific errors (checked first for precise classification) ──────────
  {
    // Covers new HEDRA_DNS_FAILURE prefix, legacy HEDRA_NETWORK_ERROR, and raw OS codes
    test:      m => /HEDRA_DNS_FAILURE|HEDRA_NETWORK_ERROR|getaddrinfo ENOTFOUND|ECONNREFUSED|ECONNRESET.*hedra/i.test(m),
    code:      "HEDRA_NETWORK_ERROR",
    retryable: true,
    hint:      "TCP/DNS failure reaching Hedra. Check HEDRA_API_BASE env var and outbound network policy.",
  },
  {
    test:      m => /HEDRA_.*INVALID|HEDRA_.*TRUNCATED|HEDRA_.*MISSING|HEDRA_.*SHORT/i.test(m),
    code:      "HEDRA_INVALID_URL",
    retryable: false,
    hint:      "A media URL failed Hedra pre-flight validation. Check URL construction and signed URL generation.",
  },
  {
    test:      m => /HEDRA_PRECHECK|HEAD.*precheck.*fail|precheck.*hedra/i.test(m),
    code:      "HEDRA_PRECHECK_FAILED",
    retryable: true,
    hint:      "Media asset HEAD check returned non-200 before Hedra call. Re-sign the URL and verify bucket access.",
  },
  {
    // Covers both asset-phase and generation-phase 5xx
    test:      m => /HEDRA_PROVIDER_5XX|Hedra submit failed HTTP 5\d\d|hedra.*50\d/i.test(m),
    code:      "HEDRA_PROVIDER_5XX",
    retryable: true,
    hint:      "Hedra server error. Wait and retry — this is a provider-side failure.",
  },
  {
    // Asset create/upload failures from the new upload flow
    test:      m => /HEDRA_ASSET_FETCH_FAILED|HEDRA_ASSET_CREATE_FAILED|HEDRA_ASSET_UPLOAD_FAILED/i.test(m),
    code:      "HEDRA_ASSET_FAILED",
    retryable: true,
    hint:      "Failed to fetch or upload a media asset to Hedra. Check signed URL freshness and Hedra connectivity.",
  },
  // ── General patterns ─────────────────────────────────────────────────────────
  {
    test:      m => /api[_ ]?key|unauthorized|401|forbidden|403/i.test(m),
    code:      "AUTH_FAILURE",
    retryable: false,
    hint:      "Check env vars: HEDRA_API_KEY must be set and valid.",
  },
  {
    test:      m => /timed? ?out|timeout|exceeded.*\d+s/i.test(m),
    code:      "TIMEOUT",
    retryable: true,
    hint:      "Provider job exceeded max poll time. Retry or reduce resolution.",
  },
  {
    test:      m => /mime|content.?type/i.test(m),
    code:      "MIME_MISMATCH",
    retryable: false,
    hint:      "Asset has wrong content-type. Verify upload completed correctly.",
  },
  {
    test:      m => /truncat|content.?length|too small|< minimum/i.test(m),
    code:      "TRUNCATION_ERROR",
    retryable: false,
    hint:      "Asset is smaller than expected. Re-upload and validate before retrying.",
  },
  {
    test:      m => /HEAD request failed|http [45]\d\d|fetch.*fail/i.test(m),
    code:      "FETCH_FAILED",
    retryable: true,
    hint:      "Asset URL unreachable. Ensure signed URL is fresh (< 1h) and bucket is accessible.",
  },
  {
    test:      m => /hedra.*fail|job.*fail|generation.*fail|provider.*reject/i.test(m),
    code:      "MODEL_REJECTION",
    retryable: true,
    hint:      "Model rejected the job. Check image resolution, face visibility, audio length.",
  },
  {
    test:      m => /limb|extra arm|extra hand|anatomy|morph|inconsistent/i.test(m),
    code:      "MOTION_INCONSISTENCY",
    retryable: true,
    hint:      "Output has visual artifacts. Tighten visual lock constraints and retry.",
  },
];

export function classifyFailure(err: unknown): ClassifiedFailure {
  const message = err instanceof Error ? err.message : String(err);

  for (const rule of PATTERNS) {
    if (rule.test(message)) {
      return { code: rule.code, message, retryable: rule.retryable, hint: rule.hint };
    }
  }

  return {
    code:      "PIPELINE_ERROR",
    message,
    retryable: false,
    hint:      "Unclassified error. Check server logs for full stack trace.",
  };
}

// ── Log helper ────────────────────────────────────────────────────────────────

export function logFailure(tag: string, failure: ClassifiedFailure): void {
  console.error(`[${tag}] FAILURE code=${failure.code} retryable=${failure.retryable}`, {
    message: failure.message.substring(0, 300),
    hint:    failure.hint,
  });
}
