// Prompt injection guard for all AI inputs.
//
// Strips prompt-hijacking phrases before text reaches Anthropic / Flux / Kling / ElevenLabs.
// Also hard-blocks content that violates Omnyra's acceptable-use policy.
//
// Usage:
//   const { safe, text, violations } = guardPrompt(userInput);
//   if (!safe) return 400 / blocked response;
//   // use `text` (sanitized) instead of raw input

const MAX_PROMPT_LENGTH = 2000;

// Phrases that attempt to override system instructions
const INJECTION_PATTERNS: RegExp[] = [
  /ignore (previous|prior|all|any) instructions/i,
  /disregard (your|all|any|the) (previous |prior |above |system )?instructions/i,
  /forget (your|all|previous) (instructions|context|rules|prompt)/i,
  /you are now (a |an )?/i,
  /\bact as (a |an |if (you (were|are)))/i,
  /pretend (you (are|were)|to be)/i,
  /new (system )?prompt\s*:/i,
  /\[(system|assistant|human|user|instruction)\]/i,
  /<\/?(?:system|prompt|instruction|context)>/i,
  /\bDAN\s+mode\b/i,
  /jailbreak/i,
  /bypass (safety|filter|content|moderation)/i,
  /role.?play as/i,
  /your (true|real|actual) (self|personality|nature)/i,
];

// Hard-block patterns — prompt is rejected entirely (safe: false)
const HARD_BLOCK_PATTERNS: RegExp[] = [
  /\b(sexual|explicit|nude|naked|pornograph).{0,30}(child|minor|underage|teen|kid)/i,
  /\b(child|minor|underage|teen|kid).{0,30}(sexual|explicit|nude|naked|pornograph)/i,
  /\b(make|create|build|synthesize|produce).{0,50}(bomb|explosive|bioweapon|nerve agent)/i,
  /\b(self.?harm|suicide method|how to (kill|hurt) (myself|yourself))\b/i,
  /\bhow (to|do you) (make|build|create) (a |)weapon\b/i,
];

export interface PromptGuardResult {
  safe:       boolean;
  text:       string;
  violations: string[];
}

export function guardPrompt(input: string, maxLength = MAX_PROMPT_LENGTH): PromptGuardResult {
  if (!input || typeof input !== 'string') {
    return { safe: true, text: '', violations: [] };
  }

  const violations: string[] = [];
  let text = input.trim();

  // 1. Hard-block harmful content — return immediately with safe=false
  for (const p of HARD_BLOCK_PATTERNS) {
    if (p.test(text)) {
      console.warn(`[prompt-guard] BLOCKED harmful content: pattern=${p.source.slice(0, 40)}`);
      return { safe: false, text: '', violations: ['blocked: policy violation'] };
    }
  }

  // 2. Length cap
  if (text.length > maxLength) {
    violations.push(`truncated: ${text.length} → ${maxLength} chars`);
    text = text.slice(0, maxLength);
  }

  // 3. Strip injection phrases (sanitize, don't block)
  for (const p of INJECTION_PATTERNS) {
    if (p.test(text)) {
      violations.push(`injection stripped: ${p.source.slice(0, 50)}`);
      text = text.replace(new RegExp(p.source, 'gi'), '');
    }
  }

  // 4. Collapse extra whitespace left by stripping
  text = text.replace(/\s{3,}/g, '  ').trim();

  if (violations.length > 0) {
    console.warn(`[prompt-guard] sanitized input violations=[${violations.join('; ')}] preview="${text.slice(0, 60)}"`);
  }

  return { safe: true, text, violations };
}

// Convenience wrapper for multi-field forms
export function guardFields(
  fields: Record<string, string | undefined | null>,
  maxLength = MAX_PROMPT_LENGTH,
): { safe: boolean; sanitized: Record<string, string>; violations: Record<string, string[]> } {
  const sanitized: Record<string, string> = {};
  const violations: Record<string, string[]> = {};
  let allSafe = true;

  for (const [key, value] of Object.entries(fields)) {
    if (!value) { sanitized[key] = ''; continue; }
    const result = guardPrompt(value, maxLength);
    sanitized[key] = result.text;
    if (!result.safe) allSafe = false;
    if (result.violations.length) violations[key] = result.violations;
  }

  return { safe: allSafe, sanitized, violations };
}
