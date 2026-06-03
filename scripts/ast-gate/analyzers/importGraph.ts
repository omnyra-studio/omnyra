// Import graph analyzer — checks file content against import graph rules.

import type { ImportGraphRule } from "../rules/architecture.rules";

interface Violation {
  file: string;
  rule: string;
  severity: "error" | "warning";
  detail: string;
  line?: number;
}

export function analyzeImportGraph(
  relativePath: string,
  content: string,
  rules: ImportGraphRule[],
): Violation[] {
  const violations: Violation[] = [];
  const lines = content.split("\n");

  for (const rule of rules) {
    if (!rule.filePattern.test(relativePath)) continue;

    for (const forbiddenPattern of rule.forbiddenImportPatterns) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (forbiddenPattern.test(line)) {
          violations.push({
            file: relativePath,
            rule: rule.id,
            severity: rule.severity,
            detail: `${rule.description} — found: "${line.trim().substring(0, 100)}"`,
            line: i + 1,
          });
        }
      }
    }
  }

  return violations;
}
