/**
 * Provider Routing Engine (PRE) — type definitions.
 *
 * The PRE sits between ValidRenderContract and the execution planner:
 *
 *   ValidRenderContract
 *     → routeContract()       lib/routing/route-contract.ts
 *     → RoutedRenderContract  (clips annotated with provider + decision)
 *     → planExecution()       lib/render/execution-planner.ts
 *     → provider-grouped shards
 *
 * RoutedRenderContract is a strict extension of ValidRenderContract.
 * It is a narrowed type — the render gate (assertContractRenderable) must
 * pass BEFORE routing. Routing never changes clip URLs or frame math.
 *
 * Design invariants:
 *   1. Identical inputs → identical provider assignment (deterministic)
 *   2. Provider assignment is compile-time — never changes at execution
 *   3. Routing adds metadata; it never mutates contract data
 *   4. Fallback is execution-time only — routing always records the primary decision
 */

import type { OrchestratorMode } from "@/lib/orchestration/types";
import type { ValidRenderClip, ValidRenderContract } from "@/lib/timeline/contract";

export type { ValidRenderClip, ValidRenderContract };

// ── Provider identity ──────────────────────────────────────────────────────────

export type ProviderId =
  | "runway"
  | "pika"
  | "kling"
  | "fal"
  | "getimg"
  | "heygen";

// ── Scene type taxonomy — used by PNL for coherence zone classification ────────

export type SceneType =
  | "narrative"    // story-driven continuous narration
  | "action"       // high-motion physical activity
  | "product"      // product showcase / detail shots
  | "dialogue"     // talking-head / interview / presenter
  | "transition"   // b-roll / bridging shots
  | "ambient";     // atmospheric / environmental

// ── Static capability profile ──────────────────────────────────────────────────
//
// Base fields: empirical estimates — update as real telemetry arrives.
// PNL fields: used by the Provider Normalization Layer (lib/compiler/pnl.ts).

export interface ProviderProfile {
  readonly id:                ProviderId;
  readonly strengths:         ReadonlyArray<string>;
  readonly weaknesses:        ReadonlyArray<string>;
  readonly avgLatencyMs:      number;    // average time to first frame, ms
  readonly avgCostPerSecond:  number;    // USD per second of generated video
  readonly consistencyScore:  number;    // 0–1 — visual stability across clips
  readonly failureRate:       number;    // 0–1 — empirical failure probability
  readonly supportedModes:    ReadonlyArray<OrchestratorMode>;
  readonly fallback:          ProviderId | null;  // execution-time fallback only

  // ── PNL fields ─────────────────────────────────────────────────────────────
  // 8-d style bias vector dimensions (all [0, 1]):
  //   [0] photorealism     (0=stylized  → 1=photorealistic)
  //   [1] motionIntensity  (0=static    → 1=high-motion)
  //   [2] colorWarmth      (0=cool      → 1=warm/saturated)
  //   [3] cinematicDepth   (0=flat      → 1=narrow-depth-of-field)
  //   [4] lightingDrama    (0=even      → 1=high-contrast)
  //   [5] textureFidelity  (0=smooth    → 1=sharp/high-detail)
  //   [6] temporalStab     (0=variable  → 1=frame-stable)
  //   [7] subjectCentrality(0=wide/env  → 1=tight/subject-focused)
  readonly styleBiasVector:         ReadonlyArray<number>;
  readonly temporalStabilityScore:  number;  // 0–1 — frame-to-frame stability within a clip
  readonly subjectConsistencyScore: number;  // 0–1 — subject identity preservation across clips
  readonly failureDistribution:     Readonly<Partial<Record<SceneType, number>>>;  // per-scene failure rate
}

// ── Routing context — caller-supplied constraints ─────────────────────────────

export interface RoutingWeights {
  readonly consistency: number;   // 0–1 relative weight
  readonly cost:        number;
  readonly latency:     number;
}

export interface BudgetConstraints {
  readonly maxCostPerProject:     number | null;   // USD; null = no limit
  readonly maxLatencyThresholdMs: number | null;   // per clip; null = no limit
}

export interface RoutingContext {
  readonly projectId: string;
  readonly mode:      OrchestratorMode | null;
  readonly weights?:  RoutingWeights;   // overrides mode-derived weights when set
  readonly budget?:   BudgetConstraints;
}

// ── Per-clip routing decision ─────────────────────────────────────────────────
//
// Recorded at routing time and frozen into the RoutedRenderContract.
// Explains exactly why a clip was assigned to its provider.

export interface ProviderDecision {
  readonly clipId:             string;
  readonly providerId:         ProviderId;
  readonly score:              number;
  readonly reason: {
    readonly costWeight:        number;
    readonly latencyWeight:     number;
    readonly consistencyWeight: number;
    readonly modeBias:          number;
    readonly seededTiebreak:    number;
  };
  readonly deterministicSeed:  string;
  readonly decidedAt:          string;   // ISO-8601
}

// ── Fallback chain ─────────────────────────────────────────────────────────────
//
// Declared in provider profiles; resolved ONLY at execution failure time.
// The routing decision always records the primary provider.

export interface ProviderFallbackChain {
  readonly primary:  ProviderId;
  readonly chain:    ReadonlyArray<ProviderId>;
}

// ── Routed contract — the narrowed type produced by routeContract() ───────────
//
// RoutedRenderClip and RoutedRenderContract EXTEND ValidRenderClip /
// ValidRenderContract — they are strictly additive. All existing guarantees hold.

export type RoutedRenderClip = ValidRenderClip & {
  readonly provider:         ProviderId;
  readonly providerDecision: ProviderDecision;
};

export type RoutedRenderContract = Omit<ValidRenderContract, "clips"> & {
  readonly clips:          ReadonlyArray<RoutedRenderClip>;
  readonly routingContext: RoutingContext;
  readonly routedAt:       string;   // ISO-8601
};
