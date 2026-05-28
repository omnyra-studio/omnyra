/**
 * RenderContract — the single immutable source of truth for a video render job.
 *
 * Every field is computed exactly once at compile time and frozen.
 * No downstream system may recompute, infer, mutate, or re-interpret any value.
 *
 * Produced by: lib/timeline/build-contract.ts → buildRenderContract()
 * Consumed by: app/api/compose-video/route.ts (pure consumer — zero computation)
 *
 * Contract health:
 *   status: "valid"   → safe to render; all clips reachable, all invariants satisfied
 *   status: "invalid" → at least one clip failed; do not render
 */

import type { OrchestratorMode } from "@/lib/orchestration/types";
export type { OrchestratorMode };

// ── Clip metadata (director-assigned, immutable after compile) ─────────────────

export interface ClipMeta {
  readonly energyCurve:        string;
  readonly transitionIn:       string;
  readonly transitionAfter:    string;
  readonly transitionDuration: number;
  readonly zoomEffect:         boolean;
}

// ── Core node: every truth about one clip in one object ───────────────────────
//
// Fields are grouped by concern so readers can scan without cross-referencing
// four separate objects. No downstream code may derive a value that is already
// expressed here.

export interface RenderClip {
  // Identity
  readonly id:          string;   // shot_id (DB primary key)
  readonly index:       number;   // 0-based strict position in the timeline
  readonly shotNumber:  number;   // original shot_number from DB

  // Asset bindings (validated + reachable at compile time)
  readonly videoAssetId: string;  // clip_url
  readonly audioAssetId: string;  // voiceover URL | "silent" — never null

  // Frame math — pre-computed once, no re-derivation allowed downstream
  readonly startFrame:    number;  // index × SEGMENT_FRAMES
  readonly endFrame:      number;  // (index + 1) × SEGMENT_FRAMES
  readonly renderFrames:  number;  // actual clip duration in frames (round(duration_seconds × fps))
  readonly targetFrames:  number;  // SEGMENT_FRAMES — the slot this clip must fill
  readonly paddingFrames: number;  // targetFrames - renderFrames (≥ 0 always)

  // Validation state (materialized at compile time — not re-checked at render time)
  readonly reachable:        boolean;            // HEAD check passed
  readonly validationStatus: "valid" | "failed"; // "failed" flips contract.status to "invalid"

  // Director metadata
  readonly meta: ClipMeta;
}

// ── Timeline entry: explicit ordering authority ───────────────────────────────
//
// startFrame/endFrame are intentionally redundant with RenderClip fields.
// The timeline array IS the ordering declaration — clips array is the data store.
// Nothing outside this struct may define when a clip plays.

export interface RenderTimelineEntry {
  readonly clipId:     string;
  readonly startFrame: number;
  readonly endFrame:   number;
}

// ── Validation report: aggregated compile-time gate ──────────────────────────

export interface ValidationReport {
  readonly valid:      boolean;
  readonly violations: ReadonlyArray<string>;
}

// ── RenderContract: the complete immutable render job descriptor ──────────────

export interface RenderContract {
  // Context
  readonly projectId: string;
  readonly mode:      OrchestratorMode | null;  // null when called outside orchestration flow

  // Materialized pipeline output (all stages resolved and merged)
  readonly clips:      ReadonlyArray<RenderClip>;
  readonly timeline:   ReadonlyArray<RenderTimelineEntry>;
  readonly validation: ValidationReport;

  // Pre-computed totals — no re-derivation
  readonly fps:                 number;
  readonly totalDurationFrames: number;

  // Contract health gate
  readonly status:     "valid" | "invalid";
  readonly compiledAt: string;  // ISO-8601 audit trail
}

// ── ValidRenderContract — the ONLY type the render layer may accept ───────────
//
// This narrow type guarantees at the type level that:
//   - every clip passed URL reachability (reachable: true)
//   - every clip passed all invariants (validationStatus: "valid")
//   - the contract-level status is "valid"
//
// The render path in compose-video/route.ts accepts ValidRenderContract only.
// Any consumer that skips assertContractRenderable() will get a type error.

export type ValidRenderClip = RenderClip & {
  readonly reachable:        true;
  readonly validationStatus: "valid";
};

export type ValidRenderContract = Omit<RenderContract, "status" | "clips"> & {
  readonly status: "valid";
  readonly clips:  ReadonlyArray<ValidRenderClip>;
};
