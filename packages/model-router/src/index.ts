/**
 * @omnyra/model-router
 *
 * Selects the render model for each scene based on:
 *   - Narrative role (climax → Runway for max temporal coherence)
 *   - Motion complexity (high → Runway)
 *   - Duration (>45s → Luma)
 *   - Cost budget per project
 */

export type RenderModel = "kling" | "runway" | "luma";

export interface RoutingInput {
  narrativeRole:    "hook" | "development" | "climax" | "resolution";
  motionComplexity: "low" | "medium" | "high";
  durationSecs:     number;
  priority:         number;   // 1=high, 3=low
  budgetMode?:      "economy" | "balanced" | "quality";
}

export interface RoutingDecision {
  model:             RenderModel;
  reason:            string;
  estimatedCostUsd:  number;
  queuePriority:     number;
}

const MODEL_COSTS: Record<RenderModel, number> = {
  kling:  0.08,
  runway: 0.25,
  luma:   0.15,
};

export function selectModel(input: RoutingInput): RoutingDecision {
  const budget = input.budgetMode ?? "balanced";

  // Long clips — Luma handles extended durations
  if (input.durationSecs > 45) {
    return { model: "luma", reason: "duration >45s", estimatedCostUsd: MODEL_COSTS.luma, queuePriority: 2 };
  }

  // Economy mode: always Kling
  if (budget === "economy") {
    return { model: "kling", reason: "economy mode", estimatedCostUsd: MODEL_COSTS.kling, queuePriority: input.priority };
  }

  // Climax: always highest quality
  if (input.narrativeRole === "climax") {
    return { model: "runway", reason: "climax requires max temporal coherence", estimatedCostUsd: MODEL_COSTS.runway, queuePriority: 1 };
  }

  // High motion: Runway handles fast motion better
  if (input.motionComplexity === "high" && budget !== "economy") {
    return { model: "runway", reason: "high motion complexity", estimatedCostUsd: MODEL_COSTS.runway, queuePriority: input.priority };
  }

  // Default: Kling
  return { model: "kling", reason: "standard scene — cost-efficient", estimatedCostUsd: MODEL_COSTS.kling, queuePriority: input.priority };
}

export function estimateProjectCost(scenes: RoutingInput[]): number {
  return scenes.reduce((sum, s) => sum + selectModel(s).estimatedCostUsd, 0);
}
