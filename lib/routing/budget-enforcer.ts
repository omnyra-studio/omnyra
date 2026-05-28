/**
 * Budget enforcer — post-routing cost gate.
 *
 * After routeProvider() produces initial decisions, the enforcer checks
 * whether the estimated total project cost exceeds the budget ceiling.
 * If it does, it downgrades clips to cheaper providers using the declared
 * fallback chain, starting from the most expensive clips.
 *
 * Rules:
 *   - Fallback is ONLY applied by the budget enforcer (or at execution failure).
 *     routeProvider() always records the primary optimal decision.
 *   - Downgrade preserves determinism: given identical inputs and budget,
 *     the same clips are downgraded in the same order.
 *   - heygen clips are never downgraded (no fallback exists — avatar-specific).
 *   - If budget is null or clip count is 0, returns decisions unchanged.
 */

import type { ProviderDecision, BudgetConstraints } from "./types";
import { getProfile, getFallbackChain } from "./provider-profiles";

// Estimated project cost: sum(decision.provider.avgCostPerSecond × durationSeconds)
function estimateCost(
  decisions: ReadonlyArray<ProviderDecision>,
  clipDurations: ReadonlyArray<number>,
): number {
  return decisions.reduce((total, decision, i) => {
    const profile = getProfile(decision.providerId);
    return total + profile.avgCostPerSecond * (clipDurations[i] ?? 0);
  }, 0);
}

export function enforceBudget(
  decisions:     ReadonlyArray<ProviderDecision>,
  clipDurations: ReadonlyArray<number>,   // seconds, same index as decisions
  constraints:   BudgetConstraints,
): ReadonlyArray<ProviderDecision> {
  const limit = constraints.maxCostPerProject;
  if (!limit) return decisions;

  const estimated = estimateCost(decisions, clipDurations);
  if (estimated <= limit) return decisions;

  // Build a mutable copy, sorted by cost descending (most expensive first)
  const indexed = decisions.map((d, i) => ({ d, i, dur: clipDurations[i] ?? 0 }));
  indexed.sort((a, b) => {
    const ca = getProfile(a.d.providerId).avgCostPerSecond * a.dur;
    const cb = getProfile(b.d.providerId).avgCostPerSecond * b.dur;
    return cb - ca;
  });

  const result = [...decisions] as ProviderDecision[];
  let   total  = estimated;

  for (const { d, i } of indexed) {
    if (total <= limit) break;

    const chain = getFallbackChain(d.providerId);
    for (const fallbackId of chain) {
      const fallbackProfile = getProfile(fallbackId);
      const oldCost    = getProfile(d.providerId).avgCostPerSecond * (clipDurations[i] ?? 0);
      const newCost    = fallbackProfile.avgCostPerSecond          * (clipDurations[i] ?? 0);
      const saving     = oldCost - newCost;

      if (saving <= 0) continue;

      // Downgrade this clip to the fallback provider
      result[i] = Object.freeze<ProviderDecision>({
        ...d,
        providerId: fallbackId,
        reason: Object.freeze({ ...d.reason, modeBias: d.reason.modeBias - saving }),
        decidedAt: new Date().toISOString(),
      });

      total -= saving;
      break;
    }
  }

  return Object.freeze(result);
}
