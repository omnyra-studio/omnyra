import type { ShotPacket } from "@/lib/types/shot";

/** Round to one decimal to avoid floating-point noise in comparisons. */
function r1(n: number): number { return Math.round(n * 10) / 10; }

/**
 * Stamp start_time / end_time on every shot, building a monotonically
 * increasing timeline from the provided shots array (mutates in place).
 */
export function repairTimeline(shots: ShotPacket[]): ShotPacket[] {
  let cursor = 0;
  for (const shot of shots) {
    (shot as ShotPacket & { start_time: number; end_time: number }).start_time = r1(cursor);
    cursor += shot.duration_seconds;
    (shot as ShotPacket & { start_time: number; end_time: number }).end_time = r1(cursor);
  }
  return shots;
}

/**
 * Verify the timeline is gap-free and monotonically increasing.
 * Returns the first gap found, or null if the timeline is valid.
 */
export function findTimelineGap(
  shots: ShotPacket[],
): { shotNumber: number; gap: number } | null {
  for (let i = 1; i < shots.length; i++) {
    const prev = shots[i - 1] as ShotPacket & { end_time: number };
    const curr = shots[i]   as ShotPacket & { start_time: number };
    const gap = Math.abs(curr.start_time - prev.end_time);
    if (gap > 0.05) {  // 50ms tolerance for floating-point noise
      return { shotNumber: shots[i].shot_number, gap };
    }
  }
  return null;
}

/**
 * Proportionally redistribute non-avatar shot durations to bring the
 * total shot time within 1.5s of the target voiceover duration.
 * Mutates the shots array then re-stamps timestamps.
 */
export function rebalanceTimeline(
  shots: ShotPacket[],
  targetDuration: number,
): ShotPacket[] {
  const totalShotDuration = shots.reduce((sum, s) => sum + s.duration_seconds, 0);
  const drift = totalShotDuration - targetDuration;

  // Always re-stamp timestamps — even when drift is within tolerance, callers
  // may have mutated durations without updating start/end times.
  if (Math.abs(drift) <= 1.5) return repairTimeline(shots);

  const adjustable = shots.filter(s => s.content_type !== "avatar");
  const adjustableTotal = adjustable.reduce((sum, s) => sum + s.duration_seconds, 0);

  if (adjustableTotal === 0) return repairTimeline(shots);

  for (const shot of shots) {
    if (shot.content_type !== "avatar") {
      const proportion  = shot.duration_seconds / adjustableTotal;
      const adjustment  = -drift * proportion;
      // Floor at 5.0 — Seedance 2 minimum; ceiling at 10.0 — Seedance 2 maximum
      shot.duration_seconds = Math.max(5.0, Math.min(10.0, r1(shot.duration_seconds + adjustment)));
    }
  }

  return repairTimeline(shots);
}

/**
 * Derive shot durations from narration word counts, applying the mode's
 * density multiplier. Avatar shots are hard-capped at 3s.
 */
export function applyNarrationDurations(
  shots: ShotPacket[],
  densityMultiplier = 1.0,
): ShotPacket[] {
  for (const shot of shots) {
    const text      = (shot.narration_text ?? "").trim();
    const wordCount = text ? text.split(/\s+/).length : 0;

    const base = wordCount > 0
      ? r1(wordCount / 2.4 * densityMultiplier)
      : shot.duration_seconds;

    // Avatar: hard cap 3.0s — avatar max is a hard director rule.
    // Non-avatar (fal/broll): minimum 5.0s — Seedance 2 rejects requests below 5s.
    const clamped = Math.max(3.0, Math.min(10.0, base));
    shot.duration_seconds = shot.content_type === "avatar"
      ? Math.min(3.0, clamped)
      : Math.max(5.0, clamped);

    if (!shot.transition_after) {
      if (shot.attention_function === "pattern_interrupt") shot.transition_after = "flash";
      else if (shot.attention_function === "emotional_release") shot.transition_after = "fade";
      else if (shot.attention_function === "pacing_reset") shot.transition_after = "blur";
      else shot.transition_after = "cut";
    }
  }
  return repairTimeline(shots);
}
