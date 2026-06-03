// React hook discipline analyzer.

import type { ReactHookRule } from "../rules/react.rules";

interface Violation {
  file: string;
  rule: string;
  severity: "error" | "warning";
  detail: string;
  line?: number;
}

export function analyzeHooks(
  relativePath: string,
  content: string,
  rules: ReactHookRule[],
): Violation[] {
  const violations: Violation[] = [];

  for (const rule of rules) {
    if (!rule.filePattern.test(relativePath)) continue;

    const match = rule.violationPattern.exec(content);
    if (!match) continue;

    // If an exempt pattern is provided and found, skip
    if (rule.exemptPattern && rule.exemptPattern.test(content)) continue;

    // Find approximate line number
    const beforeMatch = content.substring(0, match.index);
    const lineNumber = beforeMatch.split("\n").length;

    violations.push({
      file: relativePath,
      rule: rule.id,
      severity: rule.severity,
      detail: rule.description,
      line: lineNumber,
    });
  }

  return violations;
}
