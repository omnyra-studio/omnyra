/**
 * TimelineDAG — single source of truth for a compiled video.
 *
 * Invariants (enforced by compile.ts, checked by validate.ts):
 *   - Every clip maps 1:1 to exactly one TimelineEntry
 *   - startFrame(i) = i × SEGMENT_FRAMES, endFrame(i) = (i+1) × SEGMENT_FRAMES
 *   - Clip count ≤ MAX_CLIPS (20)
 *   - Total duration ≤ MAX_DURATION_S (300 s)
 *   - audioAssetId is never null or undefined — always a URL or "silent"
 *   - Edges exist only for graph-connectivity validation, NOT for ordering
 *   - The DAG is frozen at compile time and must never be mutated
 */

export const TIMELINE_FPS        = 30;
export const SEGMENT_DURATION_S  = 15;
export const SEGMENT_FRAMES      = SEGMENT_DURATION_S * TIMELINE_FPS; // 450
export const MAX_CLIPS           = 20;
export const MAX_DURATION_S      = MAX_CLIPS * SEGMENT_DURATION_S;    // 300

// ── Core types ────────────────────────────────────────────────────────────────

/**
 * Atomic compilation unit. One 15-second slot in the timeline.
 *
 * durationFrames  = SEGMENT_FRAMES (the timeline slot — always 15s × fps).
 * renderFrames    = actual rendered clip duration in frames (may be < durationFrames
 *                   for short avatar/broll clips; the composer pads the slot).
 * audioAssetId    = voiceover URL OR the sentinel "silent". Never null/undefined.
 * status          = set to "failed" only by the compiler when the asset is missing;
 *                   a "failed" node causes the entire DAG to be rejected.
 */
export interface ClipNode {
  readonly id:              string;          // shot_id (DB primary key)
  readonly index:           number;          // 0-based strict position (0–19)
  readonly durationFrames:  number;          // SEGMENT_FRAMES (15 × fps = 450)
  readonly renderFrames:    number;          // actual clip render duration in frames
  readonly videoAssetId:    string;          // clip_url — validated reachable URL
  readonly audioAssetId:    string;          // voiceover URL | "silent"
  readonly status:          "valid" | "failed";
  readonly shotNumber:      number;          // original shot_number from DB
  readonly meta:            ClipMeta;
}

export interface ClipMeta {
  readonly energyCurve:        string;
  readonly transitionIn:       string;
  readonly transitionAfter:    string;
  readonly transitionDuration: number;
  readonly zoomEffect:         boolean;
}

/**
 * The ONLY authority for clip ordering and frame boundaries.
 * Generated deterministically: startFrame = index × SEGMENT_FRAMES.
 * Nothing outside this struct may define when a clip plays.
 */
export interface TimelineEntry {
  readonly clipId:      string;   // ClipNode.id
  readonly startFrame:  number;   // index × SEGMENT_FRAMES
  readonly endFrame:    number;   // (index + 1) × SEGMENT_FRAMES
}

/**
 * Exists solely for graph-connectivity validation.
 * MUST NOT influence ordering, timing, or render behavior.
 */
export interface TimelineEdge {
  readonly from: string;     // ClipNode.id
  readonly to:   string;     // ClipNode.id
  readonly type: "next";
}

/**
 * Immutable compiled timeline. Frozen by Object.freeze() in compile.ts.
 * The render stage consumes this struct and performs no logic of its own.
 */
export interface TimelineDAG {
  readonly rootId:       string;
  readonly clips:        ReadonlyArray<ClipNode>;
  readonly timeline:     ReadonlyArray<TimelineEntry>;
  readonly edges:        ReadonlyArray<TimelineEdge>;
  readonly fps:          number;
  readonly totalFrames:  number;
  readonly compiledAt:   string;   // ISO-8601 — audit trail
}
