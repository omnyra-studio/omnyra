/**
 * routeContract — annotates a ValidRenderContract with provider decisions.
 *
 * Produces a RoutedRenderContract where every clip has:
 *   provider:         the deterministically assigned ProviderId
 *   providerDecision: the full scoring record (scores, seed, weights)
 *
 * Pipeline position:
 *   ValidRenderContract (assertContractRenderable passed)
 *     → routeContract(contract, context)
 *     → RoutedRenderContract
 *     → planExecution()  (provider-aware shard grouping)
 *
 * Invariants:
 *   - routeContract is pure (no I/O). Events are emitted by the caller.
 *   - The contract's clips, timeline, and validation are UNCHANGED.
 *   - Budget enforcement runs after individual decisions are scored.
 *   - Identical (contract + context) → identical RoutedRenderContract.
 */

import type { ValidRenderClip, ValidRenderContract } from "@/lib/timeline/contract";
import type {
  RoutingContext,
  RoutedRenderClip,
  RoutedRenderContract,
  ProviderDecision,
} from "./types";
import { routeProvider } from "./provider-router";
import { enforceBudget } from "./budget-enforcer";
import { emitAndForget } from "@/lib/events/emitter";

export function routeContract(
  contract: ValidRenderContract,
  context:  RoutingContext,
): RoutedRenderContract {
  const clips = contract.clips as ReadonlyArray<ValidRenderClip>;

  // Score every clip independently
  const rawDecisions: ProviderDecision[] = clips.map(clip =>
    routeProvider({ id: clip.id, shotNumber: clip.shotNumber }, context),
  );

  // Apply budget enforcement if a cost ceiling is set
  const clipDurations  = clips.map(c => c.renderFrames / contract.fps);
  const finalDecisions = context.budget
    ? enforceBudget(rawDecisions, clipDurations, context.budget)
    : rawDecisions;

  // Build RoutedRenderClip[] — additive over ValidRenderClip, nothing changed
  const routedClips: RoutedRenderClip[] = clips.map((clip, i) => {
    const decision = finalDecisions[i];

    emitAndForget({
      type:          "PROVIDER_ASSIGNED",
      correlationId: context.projectId,
      payload: {
        clipId:     clip.id,
        providerId: decision.providerId,
        score:      decision.score,
        seed:       decision.deterministicSeed,
        mode:       context.mode,
      },
    });

    return Object.freeze<RoutedRenderClip>({
      ...(clip as ValidRenderClip),
      provider:         decision.providerId,
      providerDecision: decision,
    });
  });

  return Object.freeze<RoutedRenderContract>({
    // Spread all ValidRenderContract fields unchanged
    ...(contract as ValidRenderContract),
    // Override clips with routed version
    clips:          Object.freeze(routedClips) as ReadonlyArray<RoutedRenderClip>,
    routingContext: Object.freeze(context),
    routedAt:       new Date().toISOString(),
  });
}
