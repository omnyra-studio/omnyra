/**
 * @internal
 * Superseded by lib/timeline/build-contract.ts (buildRenderContract).
 * Kept for unit testing and historical reference only.
 * Production code must use buildRenderContract — not this module directly.
 *
 * Timeline compiler — the ONLY place where shot ordering is decided.
 *
 * Compiler contract:
 *   INPUT  : raw DB shot rows (any order) + optional voiceover URL
 *   OUTPUT : frozen, immutable TimelineDAG
 *
 * Stages:
 *   1. Ingest    — validate inputs, reject nulls
 *   2. Enforce   — clip count, segment duration bounds
 *   3. Sort once — by shot_number, never again
 *   4. Build     — ClipNode array with deterministic indices
 *   5. Compile   — TimelineEntry for every clip using the formula:
 *                    startFrame = index × SEGMENT_FRAMES
 *                    endFrame   = (index + 1) × SEGMENT_FRAMES
 *   6. Wire      — edges for graph-connectivity validation only
 *   7. Freeze    — Object.freeze() the entire DAG; no mutation possible
 */

import {
  TIMELINE_FPS,
  SEGMENT_FRAMES,
  SEGMENT_DURATION_S,
  MAX_CLIPS,
  type ClipNode,
  type ClipMeta,
  type TimelineEntry,
  type TimelineEdge,
  type TimelineDAG,
} from "./types";

// ── Input contract ────────────────────────────────────────────────────────────

/** Shape the compiler expects. clip_url must be non-null — missing clips fail Stage 1. */
export interface ShotAsset {
  shot_id:             string;
  shot_number:         number;
  duration_seconds:    number;
  energy_curve:        string | null;
  transition_in:       string | null;
  transition_after:    string | null;
  transition_duration: number | null;
  zoom_effect:         boolean | null;
  clip_url:            string | null;   // null → Stage 1 violation
  render_status:       string | null;   // must be "completed" → Stage 1 violation
}

// ── Error type ────────────────────────────────────────────────────────────────

export class TimelineCompileError extends Error {
  constructor(public readonly violations: string[]) {
    super(`[timeline:compile] ${violations.length} violation(s):\n  • ${violations.join("\n  • ")}`);
    this.name = "TimelineCompileError";
  }
}

// ── Compiler ──────────────────────────────────────────────────────────────────

export function compileTimeline(
  shots:        ShotAsset[],
  voiceoverUrl: string | null,
): TimelineDAG {
  const violations: string[] = [];

  // ── STAGE 1: Ingest — reject incomplete assets before any ordering ────────
  if (shots.length === 0) {
    violations.push("No clips provided");
  }

  shots.forEach((s) => {
    if (!s.clip_url) {
      violations.push(`Shot ${s.shot_number} (${s.shot_id}): missing clip_url — render must complete before compile`);
    }
    if (s.render_status !== "completed") {
      violations.push(`Shot ${s.shot_number} (${s.shot_id}): render_status="${s.render_status ?? "null"}" — only "completed" clips may enter the timeline`);
    }
  });

  if (violations.length > 0) throw new TimelineCompileError(violations);

  // ── STAGE 2: Enforce segment bounds ──────────────────────────────────────
  if (shots.length > MAX_CLIPS) {
    violations.push(`Clip count ${shots.length} exceeds max ${MAX_CLIPS}`);
  }

  shots.forEach((s) => {
    if (s.duration_seconds <= 0) {
      violations.push(`Shot ${s.shot_number}: invalid duration ${s.duration_seconds}s (must be > 0)`);
    }
    if (s.duration_seconds > SEGMENT_DURATION_S) {
      violations.push(`Shot ${s.shot_number}: duration ${s.duration_seconds}s exceeds segment ceiling ${SEGMENT_DURATION_S}s`);
    }
  });

  if (violations.length > 0) throw new TimelineCompileError(violations);

  // ── STAGE 3: Sort once — the only place shot ordering is decided ──────────
  // After this sort, array index IS the clip's position for all time.
  const sorted = [...shots].sort((a, b) => a.shot_number - b.shot_number);

  // Validate shot_number sequence is contiguous (no gaps that would indicate
  // a missing clip that should have been in the middle of the sequence).
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].shot_number - sorted[i - 1].shot_number;
    if (gap > 1) {
      violations.push(
        `Shot number gap between shot_${sorted[i - 1].shot_number} and shot_${sorted[i].shot_number} — missing clip(s) in sequence`,
      );
    }
  }

  if (violations.length > 0) throw new TimelineCompileError(violations);

  // ── STAGE 4: Build ClipNodes ──────────────────────────────────────────────
  // Audio binding is explicit here. Every clip receives either a voiceover URL
  // or the sentinel "silent" — never null, never undefined, never inferred later.
  const audioAssetId = voiceoverUrl ?? "silent";

  const clips: ClipNode[] = sorted.map((s, index) => {
    const meta: ClipMeta = Object.freeze<ClipMeta>({
      energyCurve:        s.energy_curve        ?? "sustain",
      transitionIn:       s.transition_in        ?? "hard_cut",
      transitionAfter:    s.transition_after     ?? "cut",
      transitionDuration: s.transition_duration  ?? 0,
      zoomEffect:         s.zoom_effect          ?? false,
    });

    return Object.freeze<ClipNode>({
      id:             s.shot_id,
      index,
      durationFrames: SEGMENT_FRAMES,                                   // 15s × fps slot
      renderFrames:   Math.round(s.duration_seconds * TIMELINE_FPS),    // actual render
      videoAssetId:   s.clip_url!,
      audioAssetId,
      status:         "valid",
      shotNumber:     s.shot_number,
      meta,
    });
  });

  // ── STAGE 5: Compile timeline — the ONLY ordering authority ──────────────
  // Formula is fixed: startFrame = index × SEGMENT_FRAMES
  // No sorting, no inference, no repair logic anywhere else may override this.
  const timeline: TimelineEntry[] = clips.map((clip) =>
    Object.freeze<TimelineEntry>({
      clipId:     clip.id,
      startFrame: clip.index * SEGMENT_FRAMES,
      endFrame:   (clip.index + 1) * SEGMENT_FRAMES,
    }),
  );

  // ── STAGE 6: Wire edges (validation only — NOT for sequencing) ───────────
  const edges: TimelineEdge[] = clips.slice(0, -1).map((clip, i) =>
    Object.freeze<TimelineEdge>({
      from: clip.id,
      to:   clips[i + 1].id,
      type: "next",
    }),
  );

  // ── STAGE 7: Freeze — the DAG is now immutable ────────────────────────────
  const dag: TimelineDAG = Object.freeze<TimelineDAG>({
    rootId:      clips[0].id,
    clips:       Object.freeze(clips) as ReadonlyArray<ClipNode>,
    timeline:    Object.freeze(timeline) as ReadonlyArray<TimelineEntry>,
    edges:       Object.freeze(edges) as ReadonlyArray<TimelineEdge>,
    fps:         TIMELINE_FPS,
    totalFrames: clips.length * SEGMENT_FRAMES,
    compiledAt:  new Date().toISOString(),
  });

  return dag;
}
