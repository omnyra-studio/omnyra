// ARCHIVED — moved to archive/packages/self-healing/
// This package is not used in production. Kept as a stub to prevent import errors.
// The self-healing A/B test loop is incompatible with Omnyra's deterministic architecture.

export interface SelfHealEvent {
  trigger: "drift_detected";
  jobId: string;
  timestamp: number;
  analysis: { rootCause: string; affectedLayer: string; driftCluster: null };
  mutation: { type: string; previousVersion: string; targetVersion: string; description: string };
  outcome: "promoted" | "rolled_back" | "pending_ab_test";
}

export function startABTest(_controlVersion: string, _challengerVersion: string): string {
  return "";
}

export function recordABScore(_testId: string, _version: string, _score: number): void {}

export function resolveABTest(_testId: string): "promote" | "rollback" | "insufficient_data" {
  return "insufficient_data";
}
