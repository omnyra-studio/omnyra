/**
 * Render Contract Compiler — the ONLY path to a RenderContract.
 *
 * All 7 stages execute in a single async pass. The output is a frozen,
 * immutable RenderContract. No downstream code may reproduce this logic.
 *
 * Stages:
 *   1. Ingest     — reject null/incomplete assets before ordering
 *   2. Enforce    — shot count + duration bounds
 *   3. Sort       — by shot_number, once, final (the ONLY ordering decision)
 *   4. Frame Math — startFrame, endFrame, renderFrames, paddingFrames per clip
 *   5. Reachable  — HEAD-check all URLs in parallel (fail-fast per clip)
 *   6. Build      — merge all stage outputs into frozen RenderClip[]
 *   7. Freeze     — Object.freeze() the complete RenderContract
 *
 * Throws RenderContractError for structural violations (stages 1–3).
 * Returns an "invalid" contract (not throws) for reachability failures (stage 5)
 * so callers can inspect exactly which assets are unreachable.
 */

import {
  TIMELINE_FPS,
  SEGMENT_FRAMES,
  SEGMENT_DURATION_S,
  MAX_CLIPS,
  MAX_DURATION_S,
} from "./types";
import type { OrchestratorMode } from "@/lib/orchestration/types";
import type {
  RenderClip,
  RenderTimelineEntry,
  ValidationReport,
  RenderContract,
  ValidRenderContract,
  ClipMeta,
} from "./contract";
export type { ValidRenderContract };

// ── Input contract ────────────────────────────────────────────────────────────

export interface ShotAssetInput {
  shot_id:             string;
  shot_number:         number;
  duration_seconds:    number;
  energy_curve:        string | null;
  transition_in:       string | null;
  transition_after:    string | null;
  transition_duration: number | null;
  zoom_effect:         boolean | null;
  clip_url:            string | null;   // null → Stage 1 violation (throws)
  render_status:       string | null;   // must be "completed" → Stage 1 violation (throws)
}

// ── Error type ────────────────────────────────────────────────────────────────

export class RenderContractError extends Error {
  constructor(public readonly violations: string[]) {
    super(`[render-contract] ${violations.length} violation(s):\n  • ${violations.join("\n  • ")}`);
    this.name = "RenderContractError";
  }
}

// ── Compiler ──────────────────────────────────────────────────────────────────

export async function buildRenderContract(
  shots:        ShotAssetInput[],
  voiceoverUrl: string | null,
  projectId:    string,
  mode?:        OrchestratorMode,
): Promise<RenderContract> {
  const hardViolations: string[] = [];

  // ── STAGE 1: Ingest — reject incomplete assets before any ordering ────────
  if (shots.length === 0) hardViolations.push("No clips provided");

  for (const s of shots) {
    if (!s.clip_url) {
      hardViolations.push(
        `Shot ${s.shot_number} (${s.shot_id}): missing clip_url — render must complete before contract can be built`,
      );
    }
    if (s.render_status !== "completed") {
      hardViolations.push(
        `Shot ${s.shot_number} (${s.shot_id}): render_status="${s.render_status ?? "null"}" — only "completed" clips may enter the contract`,
      );
    }
  }

  if (hardViolations.length > 0) throw new RenderContractError(hardViolations);

  // ── STAGE 2: Enforce bounds ───────────────────────────────────────────────
  if (shots.length > MAX_CLIPS) {
    hardViolations.push(`Clip count ${shots.length} exceeds MAX_CLIPS (${MAX_CLIPS})`);
  }

  for (const s of shots) {
    if (s.duration_seconds <= 0) {
      hardViolations.push(`Shot ${s.shot_number}: invalid duration ${s.duration_seconds}s (must be > 0)`);
    }
    if (s.duration_seconds > SEGMENT_DURATION_S) {
      hardViolations.push(
        `Shot ${s.shot_number}: duration ${s.duration_seconds}s exceeds segment ceiling ${SEGMENT_DURATION_S}s`,
      );
    }
  }

  if (hardViolations.length > 0) throw new RenderContractError(hardViolations);

  // ── STAGE 3: Sort — the ONLY place ordering is decided ───────────────────
  // After this sort, array index IS the clip's position for all time.
  const sorted = [...shots].sort((a, b) => a.shot_number - b.shot_number);

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].shot_number - sorted[i - 1].shot_number;
    if (gap > 1) {
      hardViolations.push(
        `Shot number gap between shot_${sorted[i - 1].shot_number} and shot_${sorted[i].shot_number} — missing clip(s) in sequence`,
      );
    }
  }

  if (hardViolations.length > 0) throw new RenderContractError(hardViolations);

  // ── STAGE 4: Frame math — all timing computed in one pass ─────────────────
  // Every time-related field on RenderClip is computed here and never again.
  const audioAssetId = voiceoverUrl ?? "silent";

  interface ClipDraft {
    id:           string;
    index:        number;
    shotNumber:   number;
    videoAssetId: string;
    audioAssetId: string;
    startFrame:   number;
    endFrame:     number;
    renderFrames: number;
    targetFrames: number;
    paddingFrames: number;
    meta:         ClipMeta;
  }

  const drafts: ClipDraft[] = sorted.map((s, index) => {
    const startFrame   = index * SEGMENT_FRAMES;
    const endFrame     = (index + 1) * SEGMENT_FRAMES;
    const renderFrames = Math.round(s.duration_seconds * TIMELINE_FPS);
    const targetFrames = SEGMENT_FRAMES;
    const paddingFrames = Math.max(0, targetFrames - renderFrames);

    const meta = Object.freeze<ClipMeta>({
      energyCurve:        s.energy_curve        ?? "sustain",
      transitionIn:       s.transition_in        ?? "hard_cut",
      transitionAfter:    s.transition_after     ?? "cut",
      transitionDuration: s.transition_duration  ?? 0,
      zoomEffect:         s.zoom_effect          ?? false,
    });

    return {
      id: s.shot_id,
      index,
      shotNumber:   s.shot_number,
      videoAssetId: s.clip_url!,
      audioAssetId,
      startFrame,
      endFrame,
      renderFrames,
      targetFrames,
      paddingFrames,
      meta,
    };
  });

  // ── STAGE 5: URL reachability — parallel HEAD checks ─────────────────────
  // All clip URLs + optional voiceover are checked in parallel.
  // Failures are captured per-clip into reachabilityMap — they do NOT throw.
  // An unreachable clip sets validationStatus="failed" on its RenderClip,
  // which flips the contract status to "invalid".
  type ReachResult = { id: string; reachable: boolean; violation: string | null };

  const headChecks: Promise<ReachResult>[] = drafts.map(async (d): Promise<ReachResult> => {
    try {
      const res = await fetch(d.videoAssetId, { method: "HEAD", cache: "no-store" });
      if (!res.ok) {
        return {
          id: d.id,
          reachable: false,
          violation: `clip[${d.index}] shot_${d.shotNumber}: HEAD ${res.status} — ${d.videoAssetId}`,
        };
      }
      return { id: d.id, reachable: true, violation: null };
    } catch (err) {
      return {
        id: d.id,
        reachable: false,
        violation: `clip[${d.index}] shot_${d.shotNumber}: unreachable — ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  });

  if (voiceoverUrl) {
    headChecks.push(
      (async (): Promise<ReachResult> => {
        try {
          const res = await fetch(voiceoverUrl, { method: "HEAD", cache: "no-store" });
          return {
            id: "__voiceover__",
            reachable: res.ok,
            violation: res.ok ? null : `voiceover: HEAD ${res.status} — ${voiceoverUrl}`,
          };
        } catch (err) {
          return {
            id: "__voiceover__",
            reachable: false,
            violation: `voiceover: unreachable — ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      })(),
    );
  }

  const headResults = await Promise.all(headChecks);
  const reachabilityMap = new Map(headResults.map(r => [r.id, r.reachable]));
  const reachabilityViolations = headResults
    .filter(r => r.violation !== null)
    .map(r => r.violation!);

  // ── STAGE 6: Build — merge all stage outputs into frozen RenderClip[] ─────
  const clips: RenderClip[] = drafts.map((d) =>
    Object.freeze<RenderClip>({
      id:           d.id,
      index:        d.index,
      shotNumber:   d.shotNumber,
      videoAssetId: d.videoAssetId,
      audioAssetId: d.audioAssetId,
      startFrame:   d.startFrame,
      endFrame:     d.endFrame,
      renderFrames: d.renderFrames,
      targetFrames: d.targetFrames,
      paddingFrames: d.paddingFrames,
      reachable:        reachabilityMap.get(d.id) ?? false,
      validationStatus: (reachabilityMap.get(d.id) ?? false) ? "valid" : "failed",
      meta:         d.meta,
    }),
  );

  // Timeline: parallel to clips, explicit ordering declaration.
  const timeline: RenderTimelineEntry[] = clips.map((clip) =>
    Object.freeze<RenderTimelineEntry>({
      clipId:     clip.id,
      startFrame: clip.startFrame,
      endFrame:   clip.endFrame,
    }),
  );

  // Structural invariants (post-build, sanity checks on the compiled output)
  const structuralViolations: string[] = [];

  if (clips.length !== timeline.length) {
    structuralViolations.push(
      `clips.length (${clips.length}) ≠ timeline.length (${timeline.length})`,
    );
  }

  for (let i = 1; i < clips.length; i++) {
    if (clips[i].startFrame !== clips[i - 1].endFrame) {
      structuralViolations.push(
        `Gap/overlap between clip[${i - 1}] (ends ${clips[i - 1].endFrame}) and clip[${i}] (starts ${clips[i].startFrame})`,
      );
    }
  }

  const totalDurationFrames = clips.length * SEGMENT_FRAMES;
  const totalDurationSeconds = totalDurationFrames / TIMELINE_FPS;
  if (totalDurationSeconds > MAX_DURATION_S) {
    structuralViolations.push(
      `Total duration ${totalDurationSeconds}s exceeds MAX_DURATION_S (${MAX_DURATION_S}s)`,
    );
  }

  // Aggregate all violations: reachability + structural
  const allViolations = [...reachabilityViolations, ...structuralViolations];

  const validation = Object.freeze<ValidationReport>({
    valid:      allViolations.length === 0,
    violations: Object.freeze(allViolations) as ReadonlyArray<string>,
  });

  // ── STAGE 7: Freeze — the contract is now immutable ───────────────────────
  const contract = Object.freeze<RenderContract>({
    projectId,
    mode: mode ?? null,
    clips:                Object.freeze(clips) as ReadonlyArray<RenderClip>,
    timeline:             Object.freeze(timeline) as ReadonlyArray<RenderTimelineEntry>,
    validation,
    fps:                  TIMELINE_FPS,
    totalDurationFrames,
    status:               validation.valid ? "valid" : "invalid",
    compiledAt:           new Date().toISOString(),
  });

  return contract;
}

// ── Render gate ────────────────────────────────────────────────────────────────

/**
 * Asserts that a RenderContract is safe to render and narrows its type to
 * ValidRenderContract. Must be called before ANY render-layer code runs.
 *
 * Two independent checks — belt-and-suspenders:
 *   1. contract.status field (rolled-up health flag set by the compiler)
 *   2. Every clip.reachable + clip.validationStatus individually
 *
 * Check 2 is intentionally redundant with check 1. It catches any divergence
 * between the rolled-up status and the per-clip fields — e.g. if a future
 * code path produces a contract with status="valid" but unreachable clips.
 *
 * Throws RenderContractError if either check fails. The render layer only
 * receives control if BOTH pass.
 *
 * @throws RenderContractError
 */
export function assertContractRenderable(
  contract: RenderContract,
): asserts contract is ValidRenderContract {
  const violations: string[] = [];

  // Check 1: rolled-up status flag
  if (contract.status !== "valid") {
    violations.push(...contract.validation.violations);
  }

  // Check 2: per-clip reachability + validation (independent of status)
  for (const clip of contract.clips) {
    if (!clip.reachable) {
      violations.push(
        `clip[${clip.index}] shot_${clip.shotNumber}: reachable=false — asset was not confirmed reachable at compile time`,
      );
    }
    if (clip.validationStatus !== "valid") {
      violations.push(
        `clip[${clip.index}] shot_${clip.shotNumber}: validationStatus="${clip.validationStatus}"`,
      );
    }
  }

  if (violations.length > 0) {
    throw new RenderContractError(violations);
  }
}
