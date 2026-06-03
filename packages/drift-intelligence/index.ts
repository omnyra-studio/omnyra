// ARCHIVED — moved to archive/packages/drift-intelligence/
// This package is not used in production. Kept as a stub to prevent import errors.
// In-memory failure clustering is incompatible with serverless deployments.

export type DriftClusterType =
  | "character_identity_instability"
  | "environment_drift"
  | "object_drift"
  | "lighting_inconsistency"
  | "prompt_ambiguity";

export type FailureFrequency = "low" | "medium" | "high" | "critical";

export interface DriftCluster {
  type: DriftClusterType;
  frequency: FailureFrequency;
  impact: "low" | "medium" | "high" | "critical";
  rootCause: string;
  occurrences: number;
  affectedScoreAvg: number;
  lastSeen: number;
}

export interface FailureRecord {
  jobId: string;
  sceneIndex: number;
  timestamp: number;
  characterScore: number;
  environmentScore: number;
  objectScore: number;
  issues: string[];
  promptVersion: string;
}

export function recordFailure(_record: FailureRecord): void {}

export function analyzeFailureClusters(): DriftCluster[] {
  return [];
}
