/**
 * Provider Routing Engine — deterministic scoring + assignment.
 *
 * Core guarantee:
 *   SAME (clipId + projectId + mode) → SAME provider EVERY TIME.
 *
 * Scoring formula per provider:
 *
 *   score = (consistencyWeight × provider.consistencyScore)
 *         + (costWeight        × normalizedInverseCost)
 *         + (latencyWeight     × normalizedInverseLatency)
 *         + modeBias
 *         + seededTiebreak           ← deterministic pseudo-random [0, 0.04]
 *
 * normalizedInverseCost    = (maxCost - cost) / (maxCost - minCost)    — higher = cheaper
 * normalizedInverseLatency = (maxLatency - latency) / (maxLatency - minLatency)  — higher = faster
 *
 * Eligible providers are those whose supportedModes includes the current mode
 * (or ALL providers when mode is null).
 *
 * Budget enforcement (lib/routing/budget-enforcer.ts) runs AFTER individual
 * decisions are made — it may downgrade decisions to cheaper providers if the
 * estimated project cost exceeds the budget ceiling.
 */

import type { OrchestratorMode } from "@/lib/orchestration/types";
import type {
  ProviderId,
  ProviderProfile,
  ProviderDecision,
  RoutingContext,
  RoutingWeights,
} from "./types";
import { getAllProfiles } from "./provider-profiles";

// ── Mode-derived defaults ──────────────────────────────────────────────────────
// Called when RoutingContext.weights is not explicitly set.

const MODE_WEIGHTS: Record<OrchestratorMode, RoutingWeights> = {
  storytime:      { consistency: 0.60, cost: 0.15, latency: 0.25 },
  influencer:     { consistency: 0.25, cost: 0.30, latency: 0.45 },
  product_launch: { consistency: 0.55, cost: 0.10, latency: 0.35 },
  general:        { consistency: 0.40, cost: 0.30, latency: 0.30 },
};

const DEFAULT_WEIGHTS: RoutingWeights = { consistency: 0.40, cost: 0.30, latency: 0.30 };

// Mode-specific provider affinity bonuses — additive, before normalization
const MODE_AFFINITY: Partial<Record<OrchestratorMode, Partial<Record<ProviderId, number>>>> = {
  storytime:      { runway: 0.15, kling: 0.08 },
  influencer:     { pika: 0.15, fal: 0.08 },
  product_launch: { runway: 0.20, kling: 0.08 },
  general:        {},
};

// ── Deterministic hash ─────────────────────────────────────────────────────────

function fnv1a(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h  = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function deterministicSeed(projectId: string, clipId: string, mode: string): string {
  return fnv1a(`${projectId}:${clipId}:${mode}`).toString(16).padStart(8, "0");
}

// Normalize seed hash to [0, maxValue] — used as tiebreaker only
function seedToFloat(seed: string, maxValue = 0.04): number {
  return (parseInt(seed, 16) / 0xffffffff) * maxValue;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function resolveWeights(context: RoutingContext): RoutingWeights {
  if (context.weights) return context.weights;
  return context.mode ? MODE_WEIGHTS[context.mode] : DEFAULT_WEIGHTS;
}

function eligibleProfiles(mode: OrchestratorMode | null): ProviderProfile[] {
  const all: ProviderProfile[] = [...getAllProfiles()];
  if (!mode) return all;
  return all.filter(p => p.supportedModes.includes(mode));
}

export function routeProvider(
  clip:    { id: string; shotNumber?: number },
  context: RoutingContext,
): ProviderDecision {
  const weights    = resolveWeights(context);
  const mode       = context.mode;
  const candidates = eligibleProfiles(mode);

  if (candidates.length === 0) {
    // Fallback: all providers eligible if none match the mode
    candidates.push(...getAllProfiles());
  }

  // Budget: filter out providers that exceed per-clip latency threshold
  const budget          = context.budget;
  const latencyFiltered = budget?.maxLatencyThresholdMs
    ? candidates.filter(p => p.avgLatencyMs <= budget.maxLatencyThresholdMs!)
    : candidates;

  // Use all candidates if latency filter removes everything
  const eligible = latencyFiltered.length > 0 ? latencyFiltered : candidates;

  // Normalization bounds
  const costs     = eligible.map(p => p.avgCostPerSecond);
  const latencies = eligible.map(p => p.avgLatencyMs);
  const minCost   = Math.min(...costs);
  const maxCost   = Math.max(...costs);
  const minLat    = Math.min(...latencies);
  const maxLat    = Math.max(...latencies);

  const costRange = maxCost - minCost || 1;
  const latRange  = maxLat  - minLat  || 1;

  const seed     = deterministicSeed(context.projectId, clip.id, mode ?? "general");
  const tiebreak = seedToFloat(seed);
  const affinity = (mode && MODE_AFFINITY[mode]) ?? {};

  let best:       ProviderProfile | null = null;
  let bestScore   = -Infinity;
  let bestReason  = { costWeight: 0, latencyWeight: 0, consistencyWeight: 0, modeBias: 0, seededTiebreak: 0 };

  for (const p of eligible) {
    const normInverseCost = (maxCost - p.avgCostPerSecond)    / costRange;
    const normInverseLat  = (maxLat  - p.avgLatencyMs)         / latRange;
    const modeBias        = (affinity as Record<string, number>)[p.id] ?? 0;

    const cw = weights.consistency * p.consistencyScore;
    const lw = weights.cost        * normInverseCost;
    const tw = weights.latency     * normInverseLat;

    const score = cw + lw + tw + modeBias + tiebreak;

    if (score > bestScore) {
      bestScore  = score;
      best       = p;
      bestReason = {
        costWeight:        lw,
        latencyWeight:     tw,
        consistencyWeight: cw,
        modeBias,
        seededTiebreak:    tiebreak,
      };
    }
  }

  // best is always non-null (eligible always has ≥1 provider)
  const chosen = best!;

  return Object.freeze<ProviderDecision>({
    clipId:            clip.id,
    providerId:        chosen.id,
    score:             bestScore,
    reason:            Object.freeze(bestReason),
    deterministicSeed: seed,
    decidedAt:         new Date().toISOString(),
  });
}
