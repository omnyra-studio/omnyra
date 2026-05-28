/**
 * Semantic clip identity — embedding-based equivalence for coherence-aware diffing.
 *
 * Replaces lexical FNV-1a equality checks in diffContracts() with a multi-faceted
 * embedding capturing subject, scene, style, and role continuity.
 *
 * Invariance rule: two clips are "render-equivalent" if their semantic embeddings
 * have cosine distance < SEMANTIC_EQ_THRESHOLD — regardless of incidental field
 * differences that don't affect visual output (e.g. minor asset URL variations
 * that serve identical content, prompt rewording that preserves meaning).
 *
 * Embedding construction (32-d L2-normalized, 4 facets × 8 dims):
 *   dims  0– 7: subject  — energyCurve + shotNumber family
 *   dims  8–15: scene    — transitions + camera motion
 *   dims 16–23: style    — timing + visual rhythm
 *   dims 24–31: role     — audio presence + timeline position
 *
 * Works on both ValidRenderClip and IRNode — both satisfy the ClipLike shape.
 *
 * PRODUCTION: Replace buildSemanticEmbedding with real CLIP/DINO embeddings from
 * actual video asset thumbnails. The interface is stable; only the internals change.
 */

import type { ClipMeta } from "@/lib/timeline/contract";

export const SEMANTIC_EQ_THRESHOLD = 0.15;  // cosine distance below which clips are "equivalent"
export const SEMANTIC_DIMS         = 32;

export type SemanticEmbedding = ReadonlyArray<number>;  // 32-d L2-normalized

// Accepted by both ValidRenderClip and IRNode
type ClipLike = {
  readonly meta:         ClipMeta;
  readonly shotNumber:   number;
  readonly audioAssetId: string;
  readonly index:        number;
  readonly startFrame:   number;
  readonly endFrame:     number;
};

// ── Hash primitive ─────────────────────────────────────────────────────────────

function fnv1a(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h  = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function seedExpand(seed: string, dims: number): number[] {
  const vec: number[] = [];
  for (let d = 0; d < dims; d++) {
    const h = fnv1a(`${seed}:${d}`);
    vec.push((h / 0xffffffff) * 2 - 1);  // [−1, 1]
  }
  return vec;
}

function l2normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}

// ── Embedding construction ─────────────────────────────────────────────────────

/**
 * Build a 32-d semantic embedding from clip metadata.
 * Four facets are constructed independently then concatenated and re-normalized.
 */
export function buildSemanticEmbedding(clip: ClipLike): SemanticEmbedding {
  const { meta, shotNumber, audioAssetId, index, startFrame, endFrame } = clip;

  // Facet 0: subject — who/what is the primary content
  const subjectVec = l2normalize(seedExpand(
    `sub:${meta.energyCurve}:${Math.floor(shotNumber / 3)}`,
    8,
  ));

  // Facet 1: scene — how the shot is staged and composed
  const sceneVec = l2normalize(seedExpand(
    `scn:${meta.transitionIn}:${meta.transitionAfter}:${meta.zoomEffect ? "zoom" : "flat"}`,
    8,
  ));

  // Facet 2: style — visual rhythm and timing texture
  const durBand  = Math.floor((endFrame - startFrame) / 15);  // ~0.5 s bands at 30fps
  const styleVec = l2normalize(seedExpand(
    `sty:${meta.energyCurve}:${meta.transitionDuration}:${durBand}`,
    8,
  ));

  // Facet 3: role — narrative function and audio context
  const positionBand = Math.floor(index / 4);
  const roleVec      = l2normalize(seedExpand(
    `rol:${audioAssetId ? "audio" : "silent"}:${positionBand}:${meta.transitionIn}`,
    8,
  ));

  return Object.freeze(
    l2normalize([...subjectVec, ...sceneVec, ...styleVec, ...roleVec]),
  );
}

// ── Distance + equivalence ─────────────────────────────────────────────────────

export function semanticDistance(a: SemanticEmbedding, b: SemanticEmbedding): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return 1 - dot;  // cosine distance (L2-normalized vectors → dot = cosine similarity)
}

export function semanticsAreEquivalent(a: ClipLike, b: ClipLike): boolean {
  return semanticDistance(buildSemanticEmbedding(a), buildSemanticEmbedding(b))
    < SEMANTIC_EQ_THRESHOLD;
}

/**
 * Compact 64-char hex fingerprint for logging and cache metadata.
 * NOT for shard cache keys — use hashClip() for those (exact lexical match required).
 */
export function semanticHashClip(clip: ClipLike): string {
  return buildSemanticEmbedding(clip)
    .map(v => ((Math.round(v * 127) & 0xff) >>> 0).toString(16).padStart(2, "0"))
    .join("");
}
