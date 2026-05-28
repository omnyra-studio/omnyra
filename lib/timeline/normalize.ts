/**
 * @internal
 * Superseded by lib/timeline/build-contract.ts (buildRenderContract).
 * Frame normalization is now computed inside the contract compiler as Stage 4,
 * with results materialized directly onto RenderClip fields.
 * Kept for unit testing and historical reference only.
 *
 * Frame normalization — Phase 2 input contract.
 *
 * Computes per-clip padding requirements so the composer microservice knows
 * exactly how many frames to pad each clip to fill its 15-second slot.
 *
 * Contract:
 *   - normalizeFrames() is a pure function of the frozen DAG — no I/O
 *   - paddingFrames is always >= 0 (the compiler enforces duration <= SEGMENT_DURATION_S)
 *   - aligned = true when the clip fills its slot exactly (renderFrames === targetFrames)
 *   - The output array is parallel to dag.clips — same length, same order
 */

import { SEGMENT_FRAMES, type TimelineDAG } from "./types";

export interface FrameNormSpec {
  readonly clipId:        string;   // ClipNode.id
  readonly shotNumber:    number;
  readonly renderFrames:  number;   // actual rendered clip duration in frames
  readonly targetFrames:  number;   // SEGMENT_FRAMES — the slot to fill
  readonly paddingFrames: number;   // targetFrames - renderFrames (>= 0 always)
  readonly aligned:       boolean;  // renderFrames <= targetFrames (should always be true post-compile)
}

/**
 * Returns one FrameNormSpec per clip, in dag.clips order.
 * Consume alongside dag.timeline — indices are parallel.
 */
export function normalizeFrames(dag: TimelineDAG): ReadonlyArray<FrameNormSpec> {
  return Object.freeze(
    dag.clips.map((clip) => {
      const targetFrames  = SEGMENT_FRAMES;
      const paddingFrames = Math.max(0, targetFrames - clip.renderFrames);
      return Object.freeze<FrameNormSpec>({
        clipId:        clip.id,
        shotNumber:    clip.shotNumber,
        renderFrames:  clip.renderFrames,
        targetFrames,
        paddingFrames,
        aligned:       clip.renderFrames <= targetFrames,
      });
    }),
  );
}
