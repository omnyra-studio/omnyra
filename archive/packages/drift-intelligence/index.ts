// Drift Intelligence Engine — learns failure patterns over time.
// Clusters failures, detects recurring violations, informs mutations.

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

// In-memory failure store (replace with persistent DB in production)
const failureHistory: FailureRecord[] = [];
const MAX_HISTORY = 1_000;

export function recordFailure(record: FailureRecord): void {
  failureHistory.unshift(record);
  if (failureHistory.length > MAX_HISTORY) failureHistory.length = MAX_HISTORY;
}

export function analyzeFailureClusters(): DriftCluster[] {
  if (failureHistory.length < 3) return [];

  const clusters: DriftCluster[] = [];
  const recent = failureHistory.slice(0, 100);

  // Character cluster
  const charFailures = recent.filter(r => r.characterScore < 70);
  if (charFailures.length >= 2) {
    clusters.push({
      type: "character_identity_instability",
      frequency: charFailures.length >= 10 ? "critical" : charFailures.length >= 5 ? "high" : "medium",
      impact: charFailures.length >= 5 ? "critical" : "high",
      rootCause: "Insufficient character constraint specificity or enforcement strength below threshold",
      occurrences: charFailures.length,
      affectedScoreAvg: Math.round(charFailures.reduce((s, r) => s + r.characterScore, 0) / charFailures.length),
      lastSeen: charFailures[0]?.timestamp ?? Date.now(),
    });
  }

  // Environment cluster
  const envFailures = recent.filter(r => r.environmentScore < 70);
  if (envFailures.length >= 2) {
    clusters.push({
      type: "environment_drift",
      frequency: envFailures.length >= 10 ? "critical" : envFailures.length >= 5 ? "high" : "medium",
      impact: "medium",
      rootCause: "Environment bible not enforced or scene prompts contain conflicting location signals",
      occurrences: envFailures.length,
      affectedScoreAvg: Math.round(envFailures.reduce((s, r) => s + r.environmentScore, 0) / envFailures.length),
      lastSeen: envFailures[0]?.timestamp ?? Date.now(),
    });
  }

  // Object cluster
  const objFailures = recent.filter(r => r.objectScore < 80);
  if (objFailures.length >= 2) {
    clusters.push({
      type: "object_drift",
      frequency: objFailures.length >= 5 ? "high" : "medium",
      impact: "medium",
      rootCause: "Object registry not injected into prompt AST or model ignoring count constraints",
      occurrences: objFailures.length,
      affectedScoreAvg: Math.round(objFailures.reduce((s, r) => s + r.objectScore, 0) / objFailures.length),
      lastSeen: objFailures[0]?.timestamp ?? Date.now(),
    });
  }

  return clusters.sort((a, b) => b.occurrences - a.occurrences);
}

export function getDominantCluster(): DriftCluster | null {
  const clusters = analyzeFailureClusters();
  return clusters[0] ?? null;
}

export function getFailureRate(windowMs = 3_600_000): number {
  const cutoff = Date.now() - windowMs;
  const recent = failureHistory.filter(r => r.timestamp >= cutoff);
  if (!recent.length) return 0;
  const failures = recent.filter(r => r.characterScore < 70 || r.environmentScore < 70 || r.objectScore < 80);
  return Math.round((failures.length / recent.length) * 100);
}
