// LEARNING SYSTEM REMOVED — pre-launch architecture cleanup.
// Omnyra is a deterministic engine. No cross-session learning is allowed.
// These exports are stubs to prevent build failures in routes that import them.
// The callers (brand-brain/record-outcome, brand-brain/analytics) are also no-ops.

export interface OutcomeInput {
  generationId: string;
  was_published: boolean;
  was_edited: boolean;
  user_rating?: number;
}

export interface BestSettings {
  bestHookType:   string | null;
  bestEnergy:     number;
  bestPacing:     "slow" | "measured" | "fast";
  bestTemplate:   string | null;
  topNiches:      string[];
  confidence:     "low" | "medium" | "high";
}

export interface CreatorHistoryAnalysis {
  totalGenerations:   number;
  publishRate:        number;
  editRate:           number;
  avgRating:          number;
  topHooks:           Array<{ hook: string; count: number; publishRate: number }>;
  topTemplates:       Array<{ template: string; count: number; publishRate: number }>;
  energyDistribution: Record<string, number>;
}

export async function processOutcome(_userId: string, _outcome: OutcomeInput): Promise<void> {
  // No-op: learning system removed
}

export async function getBestSettings(_userId: string): Promise<BestSettings> {
  return { bestHookType: null, bestEnergy: 3, bestPacing: "measured", bestTemplate: null, topNiches: [], confidence: "low" };
}

export async function reinforcePattern(
  _userId: string,
  _dimension: "hook" | "energy" | "pacing" | "template",
  _key: string,
  _signal: number,
): Promise<void> {
  // No-op: learning system removed
}

export async function analyzeCreatorHistory(_userId: string): Promise<CreatorHistoryAnalysis> {
  return {
    totalGenerations: 0,
    publishRate: 0,
    editRate: 0,
    avgRating: 0,
    topHooks: [],
    topTemplates: [],
    energyDistribution: {},
  };
}
