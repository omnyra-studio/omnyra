/**
 * Static provider capability profiles.
 *
 * Values are approximate empirical estimates based on public benchmarks and
 * internal measurements. Update `avgLatencyMs`, `avgCostPerSecond`, and
 * `failureRate` as real telemetry accumulates.
 *
 * RULE: This file is the ONLY place provider capability data lives.
 * No provider constants may appear elsewhere in the routing engine.
 */

import type { ProviderId, ProviderProfile } from "./types";

const PROFILES: Record<ProviderId, ProviderProfile> = Object.freeze({
  runway: Object.freeze({
    id:                "runway",
    strengths:         ["cinematic quality", "temporal coherence", "camera motion", "photorealism"],
    weaknesses:        ["high cost", "slow latency"],
    avgLatencyMs:      45_000,
    avgCostPerSecond:  0.050,
    consistencyScore:  0.92,
    failureRate:       0.04,
    supportedModes:    ["storytime", "product_launch", "general"] as const,
    fallback:          "kling",
    // PNL: cinematic, photorealistic, deep DoF, dramatic, stable
    styleBiasVector:         Object.freeze([0.92, 0.75, 0.55, 0.88, 0.82, 0.85, 0.90, 0.75]),
    temporalStabilityScore:  0.90,
    subjectConsistencyScore: 0.88,
    failureDistribution: Object.freeze({
      narrative: 0.03, action: 0.06, product: 0.03,
      dialogue: 0.04, transition: 0.04, ambient: 0.04,
    }),
  }),

  kling: Object.freeze({
    id:                "kling",
    strengths:         ["high visual consistency", "motion quality", "text-to-video fidelity"],
    weaknesses:        ["moderate cost", "slower than fal"],
    avgLatencyMs:      60_000,
    avgCostPerSecond:  0.035,
    consistencyScore:  0.88,
    failureRate:       0.06,
    supportedModes:    ["storytime", "product_launch", "general", "influencer"] as const,
    fallback:          "fal",
    // PNL: good quality, consistent, moderate-everything
    styleBiasVector:         Object.freeze([0.82, 0.70, 0.50, 0.78, 0.70, 0.80, 0.85, 0.72]),
    temporalStabilityScore:  0.85,
    subjectConsistencyScore: 0.84,
    failureDistribution: Object.freeze({
      narrative: 0.05, action: 0.07, product: 0.05,
      dialogue: 0.06, transition: 0.06, ambient: 0.05,
    }),
  }),

  pika: Object.freeze({
    id:                "pika",
    strengths:         ["fast generation", "low cost", "style consistency"],
    weaknesses:        ["lower photorealism", "limited motion range"],
    avgLatencyMs:      18_000,
    avgCostPerSecond:  0.015,
    consistencyScore:  0.78,
    failureRate:       0.08,
    supportedModes:    ["influencer", "general"] as const,
    fallback:          "fal",
    // PNL: stylized, fast, warm, moderate stability
    styleBiasVector:         Object.freeze([0.70, 0.65, 0.60, 0.60, 0.55, 0.70, 0.75, 0.70]),
    temporalStabilityScore:  0.78,
    subjectConsistencyScore: 0.75,
    failureDistribution: Object.freeze({
      narrative: 0.08, action: 0.07, product: 0.09,
      dialogue: 0.09, transition: 0.06, ambient: 0.07,
    }),
  }),

  fal: Object.freeze({
    id:                "fal",
    strengths:         ["low cost", "fast async dispatch", "diverse model selection"],
    weaknesses:        ["variable quality", "lower inter-clip consistency"],
    avgLatencyMs:      25_000,
    avgCostPerSecond:  0.012,
    consistencyScore:  0.72,
    failureRate:       0.09,
    supportedModes:    ["general", "influencer", "storytime"] as const,
    fallback:          "pika",
    // PNL: variable, high-motion capable, lower coherence
    styleBiasVector:         Object.freeze([0.65, 0.72, 0.50, 0.55, 0.50, 0.65, 0.65, 0.65]),
    temporalStabilityScore:  0.70,
    subjectConsistencyScore: 0.68,
    failureDistribution: Object.freeze({
      narrative: 0.08, action: 0.08, product: 0.10,
      dialogue: 0.12, transition: 0.07, ambient: 0.08,
    }),
  }),

  getimg: Object.freeze({
    id:                "getimg",
    strengths:         ["image generation", "style transfer", "very low cost"],
    weaknesses:        ["not a primary video provider — limited to image-derived clips"],
    avgLatencyMs:      8_000,
    avgCostPerSecond:  0.008,
    consistencyScore:  0.65,
    failureRate:       0.05,
    supportedModes:    ["general"] as const,
    fallback:          "fal",
    // PNL: image-derived, low motion, moderate realism
    styleBiasVector:         Object.freeze([0.60, 0.30, 0.55, 0.50, 0.45, 0.70, 0.70, 0.68]),
    temporalStabilityScore:  0.72,
    subjectConsistencyScore: 0.62,
    failureDistribution: Object.freeze({
      narrative: 0.05, action: 0.08, product: 0.04,
      dialogue: 0.07, transition: 0.04, ambient: 0.04,
    }),
  }),

});

export function getProfile(id: ProviderId): ProviderProfile {
  return PROFILES[id];
}

export function getAllProfiles(): ReadonlyArray<ProviderProfile> {
  return Object.values(PROFILES);
}

/**
 * Resolve the execution-time fallback chain for a provider.
 * Chain terminates at the first provider with fallback: null.
 * Cycle guard: max 6 hops (number of providers).
 */
export function getFallbackChain(primary: ProviderId): ReadonlyArray<ProviderId> {
  const chain: ProviderId[] = [];
  const seen  = new Set<ProviderId>([primary]);
  let   cur   = PROFILES[primary].fallback;

  while (cur !== null && !seen.has(cur) && chain.length < 6) {
    chain.push(cur);
    seen.add(cur);
    cur = PROFILES[cur].fallback;
  }

  return Object.freeze(chain);
}
