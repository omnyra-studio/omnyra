/**
 * @internal
 * Superseded by lib/timeline/build-contract.ts (buildRenderContract).
 * Structural invariants are now checked inside the contract compiler.
 * Kept for unit testing and historical reference only.
 *
 * Timeline validator — hard gate. All invariants must pass before render.
 *
 * This runs AFTER compile.ts produces a frozen DAG. Its job is to confirm
 * the compiled DAG is internally consistent as a final pre-render assertion.
 *
 * A failed validation means the compiler has a bug — not a user error.
 * Call this in tests and at the start of the render stage.
 */

import { SEGMENT_FRAMES, MAX_CLIPS, MAX_DURATION_S, TIMELINE_FPS, type TimelineDAG } from "./types";

export interface ValidationResult {
  valid:      boolean;
  violations: string[];
}

export function validateTimeline(dag: TimelineDAG): ValidationResult {
  const v: string[] = [];

  // ── Invariant 1: clip count ───────────────────────────────────────────────
  if (dag.clips.length === 0) {
    v.push("DAG contains no clips");
  }
  if (dag.clips.length > MAX_CLIPS) {
    v.push(`Clip count ${dag.clips.length} exceeds MAX_CLIPS (${MAX_CLIPS})`);
  }

  // ── Invariant 2: 1:1 clip ↔ timeline entry mapping ───────────────────────
  if (dag.clips.length !== dag.timeline.length) {
    v.push(`clips.length (${dag.clips.length}) ≠ timeline.length (${dag.timeline.length}) — every clip must have exactly one entry`);
  }

  const timelineClipIds = new Set(dag.timeline.map((e) => e.clipId));
  dag.clips.forEach((clip) => {
    if (!timelineClipIds.has(clip.id)) {
      v.push(`Clip ${clip.id} (shot_${clip.shotNumber}) has no TimelineEntry`);
    }
  });

  // ── Invariant 3: index contiguity + deterministic frame math ─────────────
  dag.clips.forEach((clip, i) => {
    if (clip.index !== i) {
      v.push(`Clip ${clip.id}: index=${clip.index} but position in clips array is ${i}`);
    }
  });

  dag.timeline.forEach((entry, i) => {
    const expectedStart = i * SEGMENT_FRAMES;
    const expectedEnd   = (i + 1) * SEGMENT_FRAMES;
    if (entry.startFrame !== expectedStart) {
      v.push(`TimelineEntry[${i}] startFrame=${entry.startFrame}, expected ${expectedStart}`);
    }
    if (entry.endFrame !== expectedEnd) {
      v.push(`TimelineEntry[${i}] endFrame=${entry.endFrame}, expected ${expectedEnd}`);
    }
    if (entry.endFrame - entry.startFrame !== SEGMENT_FRAMES) {
      v.push(`TimelineEntry[${i}] slot duration ${entry.endFrame - entry.startFrame} frames ≠ SEGMENT_FRAMES (${SEGMENT_FRAMES})`);
    }
  });

  // ── Invariant 4: no gaps or overlaps ─────────────────────────────────────
  for (let i = 1; i < dag.timeline.length; i++) {
    const prev = dag.timeline[i - 1];
    const curr = dag.timeline[i];
    if (curr.startFrame !== prev.endFrame) {
      v.push(`Gap/overlap between entry[${i - 1}] (ends ${prev.endFrame}) and entry[${i}] (starts ${curr.startFrame})`);
    }
  }

  // ── Invariant 5: total duration ceiling ──────────────────────────────────
  const totalSeconds = dag.totalFrames / dag.fps;
  if (totalSeconds > MAX_DURATION_S) {
    v.push(`Total duration ${totalSeconds}s exceeds MAX_DURATION_S (${MAX_DURATION_S}s)`);
  }
  if (dag.totalFrames !== dag.clips.length * SEGMENT_FRAMES) {
    v.push(`totalFrames ${dag.totalFrames} ≠ clips.length × SEGMENT_FRAMES (${dag.clips.length * SEGMENT_FRAMES})`);
  }

  // ── Invariant 6: all clips are valid, no failed nodes ────────────────────
  dag.clips.forEach((clip) => {
    if (clip.status === "failed") {
      v.push(`Clip ${clip.id} (shot_${clip.shotNumber}) has status="failed" — partial graphs must not render`);
    }
  });

  // ── Invariant 7: explicit audio binding — no null/undefined ──────────────
  dag.clips.forEach((clip) => {
    if (!clip.audioAssetId) {
      v.push(`Clip ${clip.id} (shot_${clip.shotNumber}): audioAssetId is null/undefined — must be a URL or "silent"`);
    }
  });

  // ── Invariant 8: explicit video asset — no null/undefined ────────────────
  dag.clips.forEach((clip) => {
    if (!clip.videoAssetId) {
      v.push(`Clip ${clip.id} (shot_${clip.shotNumber}): videoAssetId is null/undefined`);
    }
  });

  // ── Invariant 9: graph connectivity — edges cover all adjacent pairs ─────
  if (dag.clips.length > 1) {
    const expectedEdgeCount = dag.clips.length - 1;
    if (dag.edges.length !== expectedEdgeCount) {
      v.push(`edges.length=${dag.edges.length}, expected ${expectedEdgeCount} (one per adjacent pair)`);
    }

    const edgeSet = new Set(dag.edges.map((e) => `${e.from}->${e.to}`));
    for (let i = 0; i < dag.clips.length - 1; i++) {
      const key = `${dag.clips[i].id}->${dag.clips[i + 1].id}`;
      if (!edgeSet.has(key)) {
        v.push(`Missing edge ${key} — graph is not fully connected`);
      }
    }
  }

  // ── Invariant 10: rootId points to the first clip ─────────────────────────
  if (dag.clips.length > 0 && dag.rootId !== dag.clips[0].id) {
    v.push(`rootId "${dag.rootId}" does not match first clip id "${dag.clips[0].id}"`);
  }

  // ── Invariant 11: fps is as expected ─────────────────────────────────────
  if (dag.fps !== TIMELINE_FPS) {
    v.push(`DAG fps=${dag.fps}, expected TIMELINE_FPS (${TIMELINE_FPS})`);
  }

  return { valid: v.length === 0, violations: v };
}

/** Throws if validation fails — use at hard gates (pre-render, post-compile). */
export function assertTimeline(dag: TimelineDAG): void {
  const result = validateTimeline(dag);
  if (!result.valid) {
    throw new Error(
      `[timeline:validate] ${result.violations.length} invariant(s) violated:\n  • ${result.violations.join("\n  • ")}`,
    );
  }
}
