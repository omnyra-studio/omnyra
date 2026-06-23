/**
 * Cost Router
 *
 * Selects the render model for each scene based on:
 *   - Narrative role (climax → quality model)
 *   - Motion complexity from Cinematography Agent
 *   - Duration (long clips → Luma which handles 60s+ natively)
 *
 * Model tiers (cheapest to most expensive):
 *   kling  → default, image-to-video, 10s clips, ~$0.08/clip
 *   runway → climax or high-motion, superior temporal coherence, ~$0.25/clip
 *   luma   → reserved for >45s duration or specific narrative needs, ~$0.15/clip
 */

export type RenderModel = "kling" | "runway" | "luma";

export interface CostRouterInput {
  narrative_role:    "hook" | "development" | "climax" | "resolution";
  motion_complexity: "low" | "medium" | "high";
  duration_secs:     number;
  priority:          number;   // 1=high, 3=low
}

export interface CostRouterOutput {
  model:             RenderModel;
  reason:            string;
  estimated_cost_usd: number;
}

const MODEL_COSTS: Record<RenderModel, number> = {
  kling:  0.08,
  runway: 0.25,
  luma:   0.15,
};

export function selectModel(scene: CostRouterInput): CostRouterOutput {
  // Long clips — Luma handles extended durations best
  if (scene.duration_secs > 45) {
    return { model: "luma", reason: "duration >45s", estimated_cost_usd: MODEL_COSTS.luma };
  }

  // Climax always gets the highest-quality model
  if (scene.narrative_role === "climax") {
    return { model: "runway", reason: "climax scene requires maximum temporal coherence", estimated_cost_usd: MODEL_COSTS.runway };
  }

  // High motion complexity — Runway handles fast motion better
  if (scene.motion_complexity === "high") {
    return { model: "runway", reason: "high motion complexity", estimated_cost_usd: MODEL_COSTS.runway };
  }

  // Default: Kling for all other scenes
  return { model: "kling", reason: "standard scene — cost-efficient default", estimated_cost_usd: MODEL_COSTS.kling };
}

/** Compute total estimated cost for all scenes in a project */
export function estimateProjectCost(scenes: CostRouterInput[]): number {
  return scenes.reduce((sum, s) => sum + selectModel(s).estimated_cost_usd, 0);
}
