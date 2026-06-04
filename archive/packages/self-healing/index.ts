// Self-Healing Loop — the core runtime cycle.
// generation_output → zero_critic → drift_analysis → prompt_compiler → new_version → A/B test → promote/rollback

import type { ValidationReportContract } from "../zero-critic";
import type { PromptAST } from "../prompt-compiler/ast";
import { mutatAST } from "../prompt-compiler/mutators";
import { recordFailure, analyzeFailureClusters, type DriftCluster } from "../drift-intelligence";
import { registerVersion, getVersion, getLatestVersion, deprecateVersion, type PromptVersion, type PromptContext } from "../prompt-versioning";

export interface SelfHealEvent {
  trigger: "drift_detected";
  jobId: string;
  timestamp: number;
  analysis: {
    rootCause: string;
    affectedLayer: "brand" | "grammar" | "physics" | "prompt" | "generation";
    driftCluster: DriftCluster | null;
  };
  mutation: {
    type: string;
    previousVersion: string;
    targetVersion: string;
    description: string;
  };
  outcome: "promoted" | "rolled_back" | "pending_ab_test";
}

// ── Version promotion/rollback ────────────────────────────────────────────────

interface ABTestSlot {
  controlVersion: string;
  challengerVersion: string;
  controlScores: number[];
  challengerScores: number[];
  startedAt: number;
}

const abTests = new Map<string, ABTestSlot>();

export function startABTest(controlVersion: string, challengerVersion: string): string {
  const testId = `ab_${Date.now()}`;
  abTests.set(testId, {
    controlVersion,
    challengerVersion,
    controlScores: [],
    challengerScores: [],
    startedAt: Date.now(),
  });
  return testId;
}

export function recordABScore(testId: string, version: string, score: number): void {
  const slot = abTests.get(testId);
  if (!slot) return;
  if (version === slot.controlVersion) slot.controlScores.push(score);
  else if (version === slot.challengerVersion) slot.challengerScores.push(score);
}

export function resolveABTest(testId: string): "promote" | "rollback" | "insufficient_data" {
  const slot = abTests.get(testId);
  if (!slot) return "insufficient_data";
  if (slot.controlScores.length < 3 || slot.challengerScores.length < 3) return "insufficient_data";

  const controlAvg = slot.controlScores.reduce((a, b) => a + b, 0) / slot.controlScores.length;
  const challengerAvg = slot.challengerScores.reduce((a, b) => a + b, 0) / slot.challengerScores.length;

  return challengerAvg > controlAvg + 5 ? "promote" : "rollback";
}

// ── Heal cycle ────────────────────────────────────────────────────────────────

export function runHealCycle(
  report: ValidationReportContract,
  currentAST: PromptAST,
): SelfHealEvent {
  const { scores, jobId } = report;

  // Record failure
  recordFailure({
    jobId,
    sceneIndex: report.sceneIndex,
    timestamp: Date.now(),
    characterScore: scores.characterConsistency,
    environmentScore: scores.environmentConsistency,
    objectScore: scores.objectConsistency,
    issues: report.driftFlags,
    promptVersion: currentAST.version,
  });

  const clusters = analyzeFailureClusters();
  const dominantCluster = clusters[0] ?? null;

  // Determine affected layer
  const affectedLayer: SelfHealEvent["analysis"]["affectedLayer"] =
    scores.characterConsistency < 70 ? "brand"
    : scores.environmentConsistency < 70 ? "brand"
    : scores.objectConsistency < 80 ? "prompt"
    : "generation";

  // Mutate AST
  const mutation = mutatAST(currentAST, {
    characterScore: scores.characterConsistency,
    environmentScore: scores.environmentConsistency,
    objectScore: scores.objectConsistency,
    issues: report.driftFlags,
  });

  // Create new version
  const currentVersion = currentAST.version;
  const parts = currentVersion.replace("v", "").split(".").map(Number);
  parts[1] = (parts[1] ?? 0) + 1;
  const newVersion = `v${parts[0]}.${parts[1]}`;

  const baseVersion = getVersion(currentVersion) ?? getLatestVersion();
  if (baseVersion) {
    const mutatedVersion: PromptVersion = {
      ...baseVersion,
      version: newVersion,
      releasedAt: Date.now(),
      deprecated: false,
      buildPrompt: (ctx: PromptContext) => {
        const { serializeAST } = require("../prompt-compiler/ast");
        return serializeAST(mutation.mutatedAST);
      },
    };
    registerVersion(mutatedVersion);
  }

  const testId = startABTest(currentVersion, newVersion);

  return {
    trigger: "drift_detected",
    jobId,
    timestamp: Date.now(),
    analysis: {
      rootCause: dominantCluster?.rootCause ?? report.recommendation.notes,
      affectedLayer,
      driftCluster: dominantCluster,
    },
    mutation: {
      type: mutation.mutationType,
      previousVersion: currentVersion,
      targetVersion: newVersion,
      description: mutation.mutationDescription,
    },
    outcome: "pending_ab_test",
  };
}
