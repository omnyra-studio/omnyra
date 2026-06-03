// Model call placement analyzer — ensures AI SDK calls only appear in API routes or lib/.

interface Violation {
  file: string;
  rule: string;
  severity: "error" | "warning";
  detail: string;
  line?: number;
}

const MODEL_CALL_PATTERNS = [
  /anthropic\.messages\.create/,
  /openai\.chat\.completions\.create/,
  /fal\.subscribe/,
  /fal\.run/,
  /elevenlabs\.generate/,
  /new Anthropic\(/,
  /new OpenAI\(/,
];

const ALLOWED_FILE_PATTERNS = [
  /^app\/api\//,
  /^lib\//,
  /^scripts\//,
  /^packages\//,
];

export function analyzeModelCalls(
  relativePath: string,
  content: string,
): Violation[] {
  // Skip files in allowed locations
  if (ALLOWED_FILE_PATTERNS.some(p => p.test(relativePath))) return [];

  const violations: Violation[] = [];
  const lines = content.split("\n");

  for (const pattern of MODEL_CALL_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (pattern.test(line)) {
        violations.push({
          file: relativePath,
          rule: "model-calls-in-api-only",
          severity: "error",
          detail: `AI SDK calls must only appear in app/api/ or lib/ — found "${line.trim().substring(0, 80)}"`,
          line: i + 1,
        });
      }
    }
  }

  return violations;
}
