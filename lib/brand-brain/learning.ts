/**
 * Brand Brain Learning Loop
 *
 * Updates preference weights after each confirmed outcome.
 * Uses exponential moving average (α = learning_rate) so recent
 * signals are weighted more than old ones.
 */

import {
  getRecentGenerations,
  getPreferenceWeights,
  upsertPreferenceWeights,
  recordOutcome,
  type GenerationRecord,
} from "./store";
import { upsertCreatorProfile, loadCreatorProfile } from "../creator-profile";

const DEFAULT_LEARNING_RATE = 0.2;

// ── EMA helper ────────────────────────────────────────────────────────────────

function ema(current: number, signal: number, alpha: number): number {
  return Math.round((current * (1 - alpha) + signal * alpha) * 1000) / 1000;
}

// ── Core outcome processor ─────────────────────────────────────────────────────

export interface OutcomeInput {
  generationId: string;
  was_published: boolean;
  was_edited:    boolean;
  user_rating?:  number;    // 1-5
}

export async function processOutcome(
  userId: string,
  outcome: OutcomeInput,
): Promise<void> {
  // 1. Write raw outcome to DB
  await recordOutcome(userId, outcome.generationId, {
    was_published: outcome.was_published,
    was_edited:    outcome.was_edited,
    user_rating:   outcome.user_rating,
  });

  // 2. Get the generation record that was just updated
  const recent = await getRecentGenerations(userId, 1);
  const gen = recent[0];
  if (!gen) return;

  // 3. Compute success signal (0 or 1)
  // Published without edit = 1.0 (great), published with edit = 0.6, unpublished = 0.0
  // User rating (1-5) adds up to +0.5 bonus
  const baseSignal = outcome.was_published ? (outcome.was_edited ? 0.6 : 1.0) : 0.0;
  const ratingBonus = outcome.user_rating ? (outcome.user_rating - 3) * 0.1 : 0;
  const signal = Math.min(1, Math.max(0, baseSignal + ratingBonus));

  // 4. Load existing weights (or initialize)
  const existing = await getPreferenceWeights(userId);
  const alpha = existing?.learning_rate ?? DEFAULT_LEARNING_RATE;

  const hookWeights:     Record<string, number> = { ...(existing?.hook_weights     ?? {}) };
  const energyWeights:   Record<string, number> = { ...(existing?.energy_weights   ?? {}) };
  const pacingWeights:   Record<string, number> = { ...(existing?.pacing_weights   ?? {}) };
  const templateWeights: Record<string, number> = { ...(existing?.template_weights ?? {}) };

  // 5. Update weights for each dimension that was used
  if (gen.hook_type) {
    hookWeights[gen.hook_type] = ema(hookWeights[gen.hook_type] ?? 0.5, signal, alpha);
  }
  if (gen.energy_level != null) {
    const key = String(gen.energy_level);
    energyWeights[key] = ema(energyWeights[key] ?? 0.5, signal, alpha);
  }
  if (gen.pacing) {
    pacingWeights[gen.pacing] = ema(pacingWeights[gen.pacing] ?? 0.5, signal, alpha);
  }
  if (gen.template) {
    templateWeights[gen.template] = ema(templateWeights[gen.template] ?? 0.5, signal, alpha);
  }

  // 6. Compute top niches from recent history
  const allRecent = await getRecentGenerations(userId, 30);
  const nicheCounts: Record<string, number> = {};
  for (const r of allRecent) {
    if (r.niche) nicheCounts[r.niche] = (nicheCounts[r.niche] ?? 0) + 1;
  }
  const topNiches = Object.entries(nicheCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([niche]) => niche);

  // 7. Persist updated weights
  await upsertPreferenceWeights(userId, {
    hook_weights:     hookWeights,
    energy_weights:   energyWeights,
    pacing_weights:   pacingWeights,
    template_weights: templateWeights,
    top_niches:       topNiches,
    learning_rate:    alpha,
  });

  // 8. Sync quality score back to creator_profiles
  const profile = await loadCreatorProfile(userId);
  if (profile) {
    const newScore = ema(profile.quality_score, signal, alpha);
    const newTotal = profile.total_videos + (outcome.was_published ? 1 : 0);
    await upsertCreatorProfile(userId, {
      quality_score: newScore,
      total_videos:  newTotal,
    });
  }

  console.log(`[brand-brain:learning] userId=${userId} signal=${signal.toFixed(2)} hookWeights=${JSON.stringify(hookWeights)} energyWeights=${JSON.stringify(energyWeights)}`);
}

// ── Derived recommendations ────────────────────────────────────────────────────

export interface BestSettings {
  bestHookType:   string | null;
  bestEnergy:     number;
  bestPacing:     "slow" | "measured" | "fast";
  bestTemplate:   string | null;
  topNiches:      string[];
  confidence:     "low" | "medium" | "high";
}

export async function getBestSettings(userId: string): Promise<BestSettings> {
  const weights = await getPreferenceWeights(userId);
  const recent  = await getRecentGenerations(userId, 5);

  const totalGenerations = recent.length;
  const confidence: BestSettings["confidence"] =
    totalGenerations < 3 ? "low" :
    totalGenerations < 10 ? "medium" : "high";

  function topKey(map: Record<string, number> | undefined): string | null {
    if (!map || !Object.keys(map).length) return null;
    return Object.entries(map).sort((a, b) => b[1] - a[1])[0][0];
  }

  const bestEnergyKey = topKey(weights?.energy_weights);
  const bestPacingKey = topKey(weights?.pacing_weights) as "slow" | "measured" | "fast" | null;

  return {
    bestHookType: topKey(weights?.hook_weights),
    bestEnergy:   bestEnergyKey ? Number(bestEnergyKey) : 3,
    bestPacing:   bestPacingKey ?? "measured",
    bestTemplate: topKey(weights?.template_weights),
    topNiches:    weights?.top_niches ?? [],
    confidence,
  };
}

// ── Pattern reinforcement (legacy compat) ──────────────────────────────────────

export async function reinforcePattern(
  userId: string,
  dimension: "hook" | "energy" | "pacing" | "template",
  key: string,
  signal: number,
): Promise<void> {
  const existing = await getPreferenceWeights(userId);
  const alpha = existing?.learning_rate ?? DEFAULT_LEARNING_RATE;

  const dimensionMap: Record<string, Record<string, number>> = {
    hook:     { ...(existing?.hook_weights     ?? {}) },
    energy:   { ...(existing?.energy_weights   ?? {}) },
    pacing:   { ...(existing?.pacing_weights   ?? {}) },
    template: { ...(existing?.template_weights ?? {}) },
  };

  dimensionMap[dimension][key] = ema(dimensionMap[dimension][key] ?? 0.5, signal, alpha);

  await upsertPreferenceWeights(userId, {
    hook_weights:     dimensionMap.hook,
    energy_weights:   dimensionMap.energy,
    pacing_weights:   dimensionMap.pacing,
    template_weights: dimensionMap.template,
  });
}

// ── History analysis for profile building ──────────────────────────────────────

export interface CreatorHistoryAnalysis {
  totalGenerations: number;
  publishRate:      number;    // 0–1
  editRate:         number;    // 0–1
  avgRating:        number;    // 1–5 or 0 if no ratings
  topHooks:         Array<{ hook: string; count: number; publishRate: number }>;
  topTemplates:     Array<{ template: string; count: number; publishRate: number }>;
  energyDistribution: Record<string, number>;
}

export async function analyzeCreatorHistory(userId: string): Promise<CreatorHistoryAnalysis> {
  const all = await getRecentGenerations(userId, 100);

  const withOutcome  = all.filter(g => g.outcome_recorded);
  const published    = withOutcome.filter(g => g.was_published);
  const edited       = withOutcome.filter(g => g.was_edited);
  const rated        = all.filter(g => g.user_rating != null);

  // Hook analysis
  const hookMap: Record<string, { count: number; published: number }> = {};
  for (const g of withOutcome) {
    if (!g.hook_type) continue;
    if (!hookMap[g.hook_type]) hookMap[g.hook_type] = { count: 0, published: 0 };
    hookMap[g.hook_type].count++;
    if (g.was_published) hookMap[g.hook_type].published++;
  }
  const topHooks = Object.entries(hookMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([hook, { count, published }]) => ({
      hook,
      count,
      publishRate: count > 0 ? published / count : 0,
    }));

  // Template analysis
  const tmplMap: Record<string, { count: number; published: number }> = {};
  for (const g of withOutcome) {
    if (!g.template) continue;
    if (!tmplMap[g.template]) tmplMap[g.template] = { count: 0, published: 0 };
    tmplMap[g.template].count++;
    if (g.was_published) tmplMap[g.template].published++;
  }
  const topTemplates = Object.entries(tmplMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([template, { count, published }]) => ({
      template,
      count,
      publishRate: count > 0 ? published / count : 0,
    }));

  // Energy distribution (count of each energy level used)
  const energyDist: Record<string, number> = {};
  for (const g of all) {
    if (g.energy_level != null) {
      const key = String(g.energy_level);
      energyDist[key] = (energyDist[key] ?? 0) + 1;
    }
  }

  const avgRating = rated.length
    ? rated.reduce((sum, g) => sum + (g.user_rating ?? 0), 0) / rated.length
    : 0;

  return {
    totalGenerations:  all.length,
    publishRate:       withOutcome.length > 0 ? published.length / withOutcome.length : 0,
    editRate:          withOutcome.length > 0 ? edited.length / withOutcome.length : 0,
    avgRating,
    topHooks,
    topTemplates,
    energyDistribution: energyDist,
  };
}
