/**
 * Provider Normalization Layer (PNL) — coherence-first provider scoring.
 *
 * PNL post-processes RoutedRenderContract decisions to minimize cross-provider
 * drift, instability, and scene-type mismatch. It runs AFTER routeContract() and
 * BEFORE planExecution() in the compile() pipeline.
 *
 * Scoring formula (lower = better):
 *   pnlScore(provider, clip) = costNorm(provider)
 *                             + driftRisk(provider, sceneType)
 *                             + instabilityPenalty(provider)
 *                             + coherenceVariance(provider, sceneType)
 *                             + switchingPenalty(provider, prevProvider)
 *
 * Selection: argmin(pnlScore) across all eligible providers.
 * Rejection: if argmin score > COHERENCE_REJECTION_THRESHOLD, throws PNLConstraintError.
 *
 * Provider clustering: consecutive clips of the same inferred scene type form a
 * coherence zone. Within a zone, switching provider incurs SWITCHING_PENALTY,
 * biasing toward intra-zone continuity without hard-locking to any single provider.
 */

import type { ProviderId, ProviderProfile, RoutingContext, SceneType, RoutedRenderClip, RoutedRenderContract, ProviderDecision } from "@/lib/routing/types";
import type { ValidRenderClip } from "@/lib/timeline/contract";
import { getProfile, getAllProfiles, getFallbackChain } from "@/lib/routing/provider-profiles";
import { emitAndForget } from "@/lib/events/emitter";

// ── Constants ──────────────────────────────────────────────────────────────────

export const COHERENCE_REJECTION_THRESHOLD = 1.20;  // argmin above this → compile rejection
export const SWITCHING_PENALTY             = 0.15;  // cross-zone provider switch penalty
export const INSTABILITY_SCALE             = 5.0;   // failure rate → penalty scaling factor
export const DRIFT_RISK_SCALE              = 0.80;  // cosine distance → penalty scaling factor

// ── PNL Constraint Error ───────────────────────────────────────────────────────

export class PNLConstraintError extends Error {
  constructor(
    public readonly clipId:    string,
    public readonly sceneType: SceneType,
    public readonly minScore:  number,
    public readonly threshold: number,
  ) {
    super(
      `[pnl] No coherent provider for clip "${clipId}" (scene="${sceneType}"): ` +
      `argmin pnlScore=${minScore.toFixed(3)} exceeds threshold=${threshold}`,
    );
    this.name = "PNLConstraintError";
  }
}

// ── Scene-type ideal style vectors ────────────────────────────────────────────
// Dimension semantics (matches ProviderProfile.styleBiasVector):
//   [0] photorealism  [1] motionIntensity  [2] colorWarmth  [3] cinematicDepth
//   [4] lightingDrama [5] textureFidelity  [6] temporalStab [7] subjectCentrality

const SCENE_IDEAL_VECTORS: Record<SceneType, ReadonlyArray<number>> = {
  narrative:  Object.freeze([0.75, 0.45, 0.65, 0.78, 0.72, 0.78, 0.85, 0.72]),
  action:     Object.freeze([0.65, 0.92, 0.50, 0.55, 0.70, 0.65, 0.55, 0.55]),
  product:    Object.freeze([0.92, 0.22, 0.52, 0.85, 0.75, 0.92, 0.90, 0.90]),
  dialogue:   Object.freeze([0.88, 0.18, 0.65, 0.72, 0.62, 0.82, 0.93, 0.96]),
  transition: Object.freeze([0.62, 0.58, 0.52, 0.50, 0.48, 0.60, 0.68, 0.42]),
  ambient:    Object.freeze([0.68, 0.30, 0.68, 0.62, 0.55, 0.68, 0.78, 0.35]),
};

// ── Scene type inference ───────────────────────────────────────────────────────

export function inferSceneType(clip: ValidRenderClip): SceneType {
  const { energyCurve, transitionIn, transitionAfter, zoomEffect } = clip.meta;

  // Dialogue: audio clip with stable camera → presenter/interview content
  if (clip.audioAssetId && clip.audioAssetId !== "silent" && !zoomEffect) {
    if (energyCurve === "steady" || energyCurve === "calm") return "dialogue";
  }

  // Action: high-energy with motion or zoom
  if (energyCurve === "intense" || energyCurve === "dramatic") return "action";
  if (zoomEffect && (energyCurve === "energetic" || energyCurve === "dynamic")) return "action";

  // Product: zoom in/out without high energy → product focus
  if (zoomEffect && (energyCurve === "steady" || energyCurve === "smooth")) return "product";

  // Transition: short bridging shots (cut transitions both in and after)
  if (transitionIn === "cut" && transitionAfter === "cut") return "transition";

  // Ambient: fading in/out, low energy
  if (transitionIn === "fade" || transitionAfter === "fade") {
    if (energyCurve === "steady" || energyCurve === "calm") return "ambient";
  }

  // Default: narrative
  return "narrative";
}

// ── PNL scoring ────────────────────────────────────────────────────────────────

function l2normalize(vec: ReadonlyArray<number>): number[] {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return [...vec].map(v => v / norm);
}

function cosineDist(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  const na = l2normalize(a);
  const nb = l2normalize(b);
  let dot = 0;
  for (let i = 0; i < na.length; i++) dot += na[i] * nb[i];
  return 1 - dot;
}

/** Drift risk: cosine distance between provider's style and scene's ideal vector. */
function driftRisk(profile: ProviderProfile, sceneType: SceneType): number {
  return cosineDist(profile.styleBiasVector, SCENE_IDEAL_VECTORS[sceneType]) * DRIFT_RISK_SCALE;
}

/** Instability penalty: failure rate scaled by cost (penalizes unreliable AND expensive). */
function instabilityPenalty(profile: ProviderProfile): number {
  return profile.failureRate * INSTABILITY_SCALE;
}

/** Per-scene coherence variance: scene-specific failure rate from distribution. */
function coherenceVariance(profile: ProviderProfile, sceneType: SceneType): number {
  return profile.failureDistribution[sceneType] ?? profile.failureRate;
}

/** Cost normalization across all eligible providers (lower cost → lower score contribution). */
function costNorm(profile: ProviderProfile, allProfiles: ProviderProfile[]): number {
  const max = Math.max(...allProfiles.map(p => p.avgCostPerSecond));
  const min = Math.min(...allProfiles.map(p => p.avgCostPerSecond));
  const range = max - min || 1;
  return (profile.avgCostPerSecond - min) / range;  // [0, 1] — lower cost = lower score
}

export interface PNLScore {
  readonly providerId:         ProviderId;
  readonly total:              number;
  readonly driftRisk:          number;
  readonly instabilityPenalty: number;
  readonly coherenceVariance:  number;
  readonly costNorm:           number;
  readonly switchingPenalty:   number;
}

export function scoreProvider(
  providerId:   ProviderId,
  sceneType:    SceneType,
  prevProvider: ProviderId | null,
  allProfiles:  ProviderProfile[],
): PNLScore {
  const profile   = getProfile(providerId);
  const dr        = driftRisk(profile, sceneType);
  const ip        = instabilityPenalty(profile);
  const cv        = coherenceVariance(profile, sceneType);
  const cn        = costNorm(profile, allProfiles);
  const sp        = (prevProvider !== null && prevProvider !== providerId) ? SWITCHING_PENALTY : 0;

  return Object.freeze<PNLScore>({
    providerId,
    total:              cn + dr + ip + cv + sp,
    driftRisk:          dr,
    instabilityPenalty: ip,
    coherenceVariance:  cv,
    costNorm:           cn,
    switchingPenalty:   sp,
  });
}

// ── Per-clip normalization ─────────────────────────────────────────────────────

/**
 * For a given clip, find the best provider under PNL constraints.
 * Starts from the current routing decision; falls back via fallback chain if needed.
 * Throws PNLConstraintError if no provider satisfies the coherence threshold.
 */
function normalizeClipProvider(
  clip:         RoutedRenderClip,
  prevProvider: ProviderId | null,
  allProfiles:  ProviderProfile[],
): { providerId: ProviderId; score: PNLScore; changed: boolean } {
  const sceneType = inferSceneType(clip);
  const current   = clip.provider;

  // Specialist providers with no fallback (e.g. heygen) are accepted unconditionally.
  // They serve content that no other provider can render — rejecting them would break
  // the workflow entirely. Their scene-type mismatch risk is accepted by the caller.
  const currentProfile = getProfile(current);
  if (currentProfile.fallback === null) {
    const score = scoreProvider(current, sceneType, prevProvider, allProfiles);
    return { providerId: current, score, changed: false };
  }

  // Score the current provider
  const currentScore = scoreProvider(current, sceneType, prevProvider, allProfiles);

  if (currentScore.total <= COHERENCE_REJECTION_THRESHOLD) {
    return { providerId: current, score: currentScore, changed: false };
  }

  // Current provider fails threshold — walk fallback chain for a better option
  const fallbackChain = getFallbackChain(current);
  let bestScore = currentScore;
  let bestId    = current;

  for (const fbId of fallbackChain) {
    const fbScore = scoreProvider(fbId, sceneType, prevProvider, allProfiles);
    if (fbScore.total < bestScore.total) {
      bestScore = fbScore;
      bestId    = fbId;
    }
  }

  if (bestScore.total > COHERENCE_REJECTION_THRESHOLD) {
    throw new PNLConstraintError(clip.id, sceneType, bestScore.total, COHERENCE_REJECTION_THRESHOLD);
  }

  return { providerId: bestId, score: bestScore, changed: bestId !== current };
}

// ── Provider clustering ────────────────────────────────────────────────────────

/**
 * Within each coherence zone (consecutive clips of the same sceneType), apply
 * additional provider clustering: if switching costs less than SWITCHING_PENALTY
 * worth of drift risk improvement, prefer staying with the zone's dominant provider.
 *
 * This is a second-pass refinement over the per-clip decisions.
 */
function applyProviderClustering(
  decisions:   Array<{ clipId: string; providerId: ProviderId; sceneType: SceneType }>,
  allProfiles: ProviderProfile[],
): Array<{ clipId: string; providerId: ProviderId }> {
  const result = decisions.map(d => ({ ...d }));

  // Walk zones: consecutive clips with same sceneType
  let zoneStart = 0;
  while (zoneStart < result.length) {
    const zoneType = result[zoneStart].sceneType;
    let zoneEnd    = zoneStart;

    while (zoneEnd < result.length && result[zoneEnd].sceneType === zoneType) {
      zoneEnd++;
    }

    // Find the zone's dominant provider (most frequently assigned)
    const counts = new Map<ProviderId, number>();
    for (let i = zoneStart; i < zoneEnd; i++) {
      const id = result[i].providerId;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];

    // Reassign clips in this zone to dominant provider if it's within margin
    for (let i = zoneStart; i < zoneEnd; i++) {
      const cur          = result[i].providerId;
      if (cur === dominant) continue;

      const curScore = scoreProvider(cur,      zoneType, i > zoneStart ? result[i-1].providerId : null, allProfiles);
      const domScore = scoreProvider(dominant, zoneType, i > zoneStart ? result[i-1].providerId : null, allProfiles);

      // Only cluster if dominant is clearly better (margin > threshold avoids thrashing)
      if (curScore.total - domScore.total > SWITCHING_PENALTY * 0.5) {
        result[i].providerId = dominant;
      }
    }

    zoneStart = zoneEnd;
  }

  return result;
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Apply PNL to a RoutedRenderContract.
 *
 * Returns a new RoutedRenderContract with PNL-normalized provider decisions.
 * Emits PROVIDER_FALLBACK_TRIGGERED for any clip whose provider was reassigned.
 * Throws PNLConstraintError if any clip has no acceptable provider.
 */
export function applyPNL(
  routedContract: RoutedRenderContract,
): RoutedRenderContract {
  const allProfiles: ProviderProfile[] = [...getAllProfiles()];

  // Pass 1: per-clip normalization
  const pass1: Array<{ clipId: string; providerId: ProviderId; sceneType: SceneType; score: PNLScore; changed: boolean }> = [];
  let prevProvider: ProviderId | null = null;

  for (const clip of routedContract.clips) {
    const { providerId, score, changed } = normalizeClipProvider(clip, prevProvider, allProfiles);
    pass1.push({ clipId: clip.id, providerId, sceneType: inferSceneType(clip), score, changed });
    prevProvider = providerId;
  }

  // Pass 2: provider clustering within coherence zones
  const pass2 = applyProviderClustering(
    pass1.map(d => ({ clipId: d.clipId, providerId: d.providerId, sceneType: d.sceneType })),
    allProfiles,
  );

  // Build a decision map for quick lookup
  const pass2ById = new Map(pass2.map(d => [d.clipId, d.providerId]));
  const pass1ById = new Map(pass1.map(d => [d.clipId, d]));

  // Construct adjusted clips
  const adjustedClips: RoutedRenderClip[] = routedContract.clips.map(clip => {
    const finalProvider = pass2ById.get(clip.id)!;
    const p1            = pass1ById.get(clip.id)!;

    if (finalProvider === clip.provider && !p1.changed) {
      return clip;  // unchanged
    }

    // Emit event for reassigned clips
    const reason = finalProvider !== clip.provider
      ? `pnl_score_exceeded_threshold`
      : `pnl_cluster_normalization`;

    emitAndForget({
      type:          "PROVIDER_FALLBACK_TRIGGERED",
      correlationId: routedContract.projectId,
      payload: {
        clipId:            clip.id,
        originalProvider:  clip.provider,
        fallbackProvider:  finalProvider,
        reason,
      },
    });

    const updatedDecision: ProviderDecision = Object.freeze({
      ...clip.providerDecision,
      providerId:   finalProvider,
      decidedAt:    new Date().toISOString(),
    });

    return Object.freeze<RoutedRenderClip>({
      ...clip,
      provider:         finalProvider,
      providerDecision: updatedDecision,
    });
  });

  const pnlChanges = adjustedClips.filter((c, i) => c.provider !== routedContract.clips[i].provider).length;
  if (pnlChanges > 0) {
    console.log(`[pnl] Normalized ${pnlChanges} provider assignment(s) across ${routedContract.clips.length} clips`);
  }

  return Object.freeze<RoutedRenderContract>({
    ...routedContract,
    clips:    Object.freeze(adjustedClips),
    routedAt: new Date().toISOString(),
  });
}
