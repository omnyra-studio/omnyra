// Zero-Critic — stateless validation engine.
// CRITICAL RULES:
//   - no memory
//   - no persistence
//   - no history awareness
//   - only produces signals, cannot influence state directly

export interface ValidationInput {
  jobId: string;
  sceneIndex: number;
  generatedFrameUrl?: string;
  sourceImageUrl?: string;
  promptSnapshot: string;
  brandState: {
    characterDesc?: string;
    environmentDesc?: string;
    objects?: Array<{ name: string; count: number }>;
  };
  expectedCharacterScore?: number;
  expectedEnvironmentScore?: number;
}

export type DriftSeverity = "none" | "low" | "medium" | "high" | "critical";

export interface ValidationReportContract {
  jobId: string;
  sceneIndex: number;
  scores: {
    characterConsistency: number;   // 0-100
    environmentConsistency: number; // 0-100
    objectConsistency: number;      // 0-100
    overall: number;                // weighted
  };
  driftFlags: string[];
  failureModes: Array<{
    type: "character_drift" | "environment_shift" | "object_loss" | "prompt_divergence";
    severity: DriftSeverity;
    detail: string;
  }>;
  recommendation: {
    action: "accept" | "retry" | "regenerate" | "tighten_constraints";
    notes: string;
  };
  isStateless: true; // compile-time reminder: this report is ephemeral
}

// Scoring thresholds
const THRESHOLDS = {
  accept:   { character: 85, environment: 80, object: 90, overall: 85 },
  retry:    { character: 65, environment: 60, object: 70, overall: 65 },
  // below retry thresholds → regenerate
};

export function computeOverallScore(
  character: number,
  environment: number,
  object: number,
): number {
  return Math.round(character * 0.5 + environment * 0.3 + object * 0.2);
}

export function buildRecommendation(
  scores: ValidationReportContract["scores"],
  driftFlags: string[],
): ValidationReportContract["recommendation"] {
  const t = THRESHOLDS;

  if (
    scores.characterConsistency >= t.accept.character &&
    scores.environmentConsistency >= t.accept.environment &&
    scores.objectConsistency >= t.accept.object
  ) {
    return { action: "accept", notes: "All dimensions within tolerance." };
  }

  if (
    scores.characterConsistency >= t.retry.character &&
    scores.environmentConsistency >= t.retry.environment &&
    scores.objectConsistency >= t.retry.object
  ) {
    return {
      action: "retry",
      notes: `Marginal drift detected: ${driftFlags.slice(0, 3).join("; ")}. Retry may resolve.`,
    };
  }

  const dominantFlag = driftFlags[0] ?? "unknown drift";
  if (scores.characterConsistency < t.retry.character) {
    return {
      action: "tighten_constraints",
      notes: `Character identity drift (${scores.characterConsistency}%). Tighten character_stability constraint. Root: ${dominantFlag}`,
    };
  }

  return {
    action: "regenerate",
    notes: `Multi-dimensional drift. Scores: char=${scores.characterConsistency} env=${scores.environmentConsistency} obj=${scores.objectConsistency}. Recommend full regeneration with stricter prompt.`,
  };
}

export function buildReportFromScores(
  input: Pick<ValidationInput, "jobId" | "sceneIndex">,
  characterScore: number,
  environmentScore: number,
  objectScore: number,
  issues: string[],
): ValidationReportContract {
  const overall = computeOverallScore(characterScore, environmentScore, objectScore);

  const failureModes: ValidationReportContract["failureModes"] = [];
  if (characterScore < 70)   failureModes.push({ type: "character_drift",    severity: characterScore   < 50 ? "high" : "medium", detail: `Score: ${characterScore}` });
  if (environmentScore < 70) failureModes.push({ type: "environment_shift",  severity: environmentScore < 50 ? "high" : "medium", detail: `Score: ${environmentScore}` });
  if (objectScore < 80)      failureModes.push({ type: "object_loss",        severity: objectScore      < 60 ? "high" : "low",    detail: `Score: ${objectScore}` });

  const scores = { characterConsistency: characterScore, environmentConsistency: environmentScore, objectConsistency: objectScore, overall };
  return {
    jobId: input.jobId,
    sceneIndex: input.sceneIndex,
    scores,
    driftFlags: issues,
    failureModes,
    recommendation: buildRecommendation(scores, issues),
    isStateless: true,
  };
}
