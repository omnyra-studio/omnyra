// Drift Regression Testing Framework.
// Provides test helpers for character drift, environment drift, object persistence.
// Run with your existing test suite (Jest/Vitest compatible).

export interface DriftTestCase {
  name: string;
  description: string;
  category: "character" | "environment" | "object";
  threshold: number; // max acceptable drift score (lower = stricter)
  run: () => Promise<DriftTestResult>;
}

export interface DriftTestResult {
  passed: boolean;
  driftScore: number;       // 0-100 (0 = no drift, 100 = total drift)
  consistencyScore: number; // inverse of drift: 100 = perfect
  details: string;
  frames?: Array<{ index: number; score: number; issues: string[] }>;
}

export interface DriftTestSuite {
  name: string;
  cases: DriftTestCase[];
  run: () => Promise<DriftSuiteResult>;
}

export interface DriftSuiteResult {
  passed: boolean;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  results: Array<{ name: string; result: DriftTestResult }>;
}

// ── Test builder ──────────────────────────────────────────────────────────────

export function createDriftTest(
  name: string,
  category: DriftTestCase["category"],
  threshold: number,
  runFn: () => Promise<DriftTestResult>,
  description = "",
): DriftTestCase {
  return { name, description, category, threshold, run: runFn };
}

export async function runDriftSuite(suite: DriftTestSuite): Promise<DriftSuiteResult> {
  const results: DriftSuiteResult["results"] = [];
  let passed = 0;

  for (const testCase of suite.cases) {
    const result = await testCase.run();
    const testPassed = result.driftScore <= testCase.threshold;
    if (testPassed) passed++;
    results.push({ name: testCase.name, result: { ...result, passed: testPassed } });
    console.log(
      `  ${testPassed ? "✓" : "✗"} ${testCase.name} — drift=${result.driftScore} (threshold=${testCase.threshold})`,
    );
  }

  return {
    passed: passed === suite.cases.length,
    totalCases: suite.cases.length,
    passedCases: passed,
    failedCases: suite.cases.length - passed,
    results,
  };
}

// ── Assertion helpers ─────────────────────────────────────────────────────────

export function assertDriftBelow(
  result: DriftTestResult,
  maxDrift: number,
  label = "drift",
): void {
  if (result.driftScore > maxDrift) {
    throw new Error(
      `${label}: drift=${result.driftScore} exceeds maximum=${maxDrift}. Details: ${result.details}`,
    );
  }
}

export function assertConsistencyAbove(
  result: DriftTestResult,
  minConsistency: number,
  label = "consistency",
): void {
  if (result.consistencyScore < minConsistency) {
    throw new Error(
      `${label}: consistency=${result.consistencyScore} below minimum=${minConsistency}.`,
    );
  }
}

// ── Mock test factory (for unit testing without real model calls) ─────────────

export function createMockDriftResult(driftScore: number, issues: string[] = []): DriftTestResult {
  return {
    passed: driftScore <= 10,
    driftScore,
    consistencyScore: 100 - driftScore,
    details: issues.length ? issues.join("; ") : "No issues detected",
  };
}

// ── Standard test suites ──────────────────────────────────────────────────────

export const STANDARD_THRESHOLDS = {
  characterIdentityStability: 10,  // max 10% drift across 10 generations
  environmentConsistency: 20,      // max 20% drift
  objectPersistence: 5,            // strict — props must remain stable
};
