/**
 * Sanitize user-supplied text before it reaches any AI provider.
 *
 * Guards against:
 *  - Prompt-injection ("ignore previous instructions…")
 *  - Jailbreak prefixes ("DAN mode", "developer mode", etc.)
 *  - Excessive length (mitigates context-stuffing)
 *  - NUL bytes and other control chars that can confuse tokenizers
 */

const INJECTION_PATTERNS = [
  // Classic overrides
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+instructions?/i,
  /disregard\s+(all\s+)?(previous|prior)\s+instructions?/i,
  /forget\s+(all\s+)?(your\s+)?(instructions?|rules?|guidelines?)/i,
  // Role-switch attacks
  /\b(act\s+as|pretend\s+to\s+be|you\s+are\s+now|roleplay\s+as)\b.*?(DAN|evil|unrestricted|jailbreak)/i,
  /\bDAN\s+mode\b/i,
  /\bdeveloper\s+mode\s+enabled\b/i,
  /\bjailbreak\b/i,
  // System-prompt exfiltration
  /\brepeat\s+(your\s+)?(system\s+)?prompt\b/i,
  /\bprint\s+(your\s+)?(initial\s+)?(instructions?|prompt)\b/i,
  /\bwhat\s+are\s+your\s+instructions?\b/i,
  // Delimiter injection
  /<<<|>>>/,
  /\[INST\]|\[\/INST\]/i,
  /<\|im_start\|>|<\|im_end\|>/i,
];

const MAX_PROMPT_CHARS = 2000;

export interface SanitizeResult {
  clean: string;
  rejected: boolean;
  reason?: string;
}

export function sanitizePrompt(input: string): SanitizeResult {
  if (!input || typeof input !== "string") {
    return { clean: "", rejected: false };
  }

  // Strip NUL bytes and non-printable control characters (except newlines/tabs)
  let cleaned = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Enforce length cap
  if (cleaned.length > MAX_PROMPT_CHARS) {
    cleaned = cleaned.slice(0, MAX_PROMPT_CHARS);
  }

  // Check for injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(cleaned)) {
      return {
        clean: "",
        rejected: true,
        reason: "prompt_injection_detected",
      };
    }
  }

  return { clean: cleaned.trim(), rejected: false };
}

export function sanitizeMany(inputs: Record<string, string>): {
  cleaned: Record<string, string>;
  rejected: boolean;
  reason?: string;
} {
  const cleaned: Record<string, string> = {};
  for (const [key, val] of Object.entries(inputs)) {
    const result = sanitizePrompt(val);
    if (result.rejected) {
      return { cleaned: {}, rejected: true, reason: `${key}: ${result.reason}` };
    }
    cleaned[key] = result.clean;
  }
  return { cleaned, rejected: false };
}
