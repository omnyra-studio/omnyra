// React hook discipline rules.

export interface ReactHookRule {
  id: string;
  description: string;
  filePattern: RegExp;
  // Pattern that signals a violation
  violationPattern: RegExp;
  // Pattern that, if present nearby, indicates a valid usage (negation check)
  exemptPattern?: RegExp;
  severity: "error" | "warning";
}

export const reactHookRules: ReactHookRule[] = [
  {
    id: "no-sync-setstate-in-effect",
    description: "setState inside useEffect body must be wrapped in setTimeout or async callback",
    filePattern: /\.(tsx?|jsx?)$/,
    // Detect: useEffect(() => { ... setState( ... without setTimeout wrapping
    violationPattern: /useEffect\(\s*\(\s*\)\s*=>\s*\{[^}]*set[A-Z][a-zA-Z]+\s*\(/,
    exemptPattern: /setTimeout/,
    severity: "warning",
  },
  {
    id: "no-date-now-in-render",
    description: "Date.now() called inside component function body may cause hydration issues — move to module scope",
    filePattern: /\.(tsx?|jsx?)$/,
    violationPattern: /(?:const|let|var)\s+\w+\s*=\s*Date\.now\(\)/,
    exemptPattern: /\/\/ module-scope|PAGE_LOAD_TIME/,
    severity: "warning",
  },
  {
    id: "no-console-log-in-components",
    description: "console.log in component render is a development artifact",
    filePattern: /^(app|components)\/.+\.(tsx?)$/,
    violationPattern: /^\s*console\.log\(/m,
    severity: "warning",
  },
  {
    id: "no-usestate-without-type",
    description: "useState should have explicit generic type in TypeScript files",
    filePattern: /\.(tsx?)$/,
    violationPattern: /useState\(\s*\[\s*\]\s*\)/,
    severity: "warning",
  },
];
