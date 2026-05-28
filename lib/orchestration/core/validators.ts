import type { ShotPacket } from "@/lib/types/shot";
import type { ModeConfig } from "@/lib/orchestration/types";
import { findTimelineGap, repairTimeline } from "./timeline";

export interface ValidationResult {
  valid:    boolean;
  errors:   string[];
  warnings: string[];
}

/**
 * Validate a shot plan against a mode's hard constraints.
 * Must pass before any plan is written to the DB.
 */
export function validateShotPlan(
  shots: ShotPacket[],
  config: ModeConfig,
): ValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  // ── Shot count bounds ────────────────────────────────────────────────────────
  if (shots.length < config.min_shots) {
    errors.push(`Shot count ${shots.length} is below the minimum of ${config.min_shots} for "${config.mode}" mode.`);
  }
  if (shots.length > config.max_shots) {
    errors.push(`Shot count ${shots.length} exceeds the maximum of ${config.max_shots} for "${config.mode}" mode.`);
  }

  // ── Narration coverage ───────────────────────────────────────────────────────
  const missingNarration = shots.filter(s => !s.narration_text?.trim());
  if (missingNarration.length > 0) {
    errors.push(
      `${missingNarration.length} shot(s) are missing narration_text: ` +
      missingNarration.map(s => `shot_${s.shot_number}`).join(", "),
    );
  }

  // ── Content type distribution ────────────────────────────────────────────────
  const disallowed = shots.filter(
    s => !(config.allowed_content_types as string[]).includes(s.content_type),
  );
  if (disallowed.length > 0) {
    warnings.push(
      `${disallowed.length} shot(s) use content type(s) not preferred for "${config.mode}" mode: ` +
      disallowed.map(s => `shot_${s.shot_number}(${s.content_type})`).join(", "),
    );
  }

  // ── Avatar duration cap ───────────────────────────────────────────────────────
  const avatarOver = shots.filter(s => s.content_type === "avatar" && s.duration_seconds > 3.0);
  if (avatarOver.length > 0) {
    errors.push(
      `${avatarOver.length} avatar shot(s) exceed the 3.0s maximum: ` +
      avatarOver.map(s => `shot_${s.shot_number}(${s.duration_seconds}s)`).join(", "),
    );
  }

  // ── Duration sanity ──────────────────────────────────────────────────────────
  const zeroDuration = shots.filter(s => s.duration_seconds <= 0);
  if (zeroDuration.length > 0) {
    errors.push(`${zeroDuration.length} shot(s) have zero or negative duration.`);
  }

  // ── Timeline continuity — auto-repair gaps rather than rejecting ──────────────
  const gap = findTimelineGap(shots);
  if (gap) {
    repairTimeline(shots);
    warnings.push(
      `Timeline gap at shot ${gap.shotNumber} (${gap.gap.toFixed(2)}s) was auto-repaired.`,
    );
  }

  // ── First shot rule ───────────────────────────────────────────────────────────
  if (shots.length > 0 && shots[0].content_type === "avatar") {
    errors.push("Shot 1 must not be an avatar shot (pattern_interrupt rule).");
  }

  // ── Pacing reset rule — required for plans with 10+ shots ────────────────────
  if (shots.length >= 10) {
    const hasPacingReset = shots.some(s => s.attention_function === "pacing_reset");
    if (!hasPacingReset) {
      warnings.push("Plans with 10+ shots must include at least one pacing_reset shot.");
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
