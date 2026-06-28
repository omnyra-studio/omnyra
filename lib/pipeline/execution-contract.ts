/**
 * Execution Contract — runtime enforcement of Omnyra's core invariants.
 *
 * Called between contract compilation and media generation.
 * Throws early (before any Runway/Flux credit is spent) if the pipeline
 * state would produce a misaligned output.
 *
 * CONTRACT AXIOMS:
 *   Voice defines time. Time defines scenes. Never reverse this order.
 *   SceneContracts are the only legal source of scene truth.
 *   One action per scene. One emotion per scene. No timing drift.
 */

import type { SceneContract, VoiceEngineResult } from "./types";

// ── Error types ───────────────────────────────────────────────────────────────

export class ExecutionContractViolation extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(`[EXECUTION_CONTRACT:${code}] ${message}`);
    this.name = "ExecutionContractViolation";
  }
}

// ── Validation entry point ────────────────────────────────────────────────────

/**
 * Validate the compiled contracts against the locked voice timing.
 * Throws ExecutionContractViolation on the first violation found.
 * Call AFTER compileContracts(), BEFORE generateImages().
 */
export function validateExecutionContract(
  contracts: SceneContract[],
  voice:     VoiceEngineResult,
): void {
  // ── Rule 1: Voice must be locked (non-zero duration) ──────────────────────
  if (!voice.audioUrl) {
    throw new ExecutionContractViolation(
      "VOICE_NOT_LOCKED",
      "Voice audioUrl is empty — voice must be generated before scenes",
    );
  }
  if (voice.totalDurationMs <= 0) {
    throw new ExecutionContractViolation(
      "VOICE_DURATION_ZERO",
      `Voice totalDurationMs=${voice.totalDurationMs} — cannot build timeline`,
    );
  }

  // ── Rule 2: Scene count must match voice timing entries ───────────────────
  if (contracts.length !== voice.timings.length) {
    throw new ExecutionContractViolation(
      "SCENE_VOICE_COUNT_MISMATCH",
      `${contracts.length} contracts vs ${voice.timings.length} voice timings — must be equal`,
    );
  }

  // ── Rule 3: Per-scene checks ──────────────────────────────────────────────
  let cumulativeMs = 0;
  for (const contract of contracts) {
    const i = contract.index;

    // Action must be non-empty (single action enforced upstream by sanitiseAction)
    if (!contract.action?.trim()) {
      throw new ExecutionContractViolation(
        "EMPTY_ACTION",
        `Scene ${i + 1}: actionUnit is empty — every scene must have exactly one action`,
      );
    }

    // Compound action check — "and" signals multiple actions
    if (/\band\b/.test(contract.action.toLowerCase())) {
      throw new ExecutionContractViolation(
        "COMPOUND_ACTION",
        `Scene ${i + 1}: action "${contract.action.slice(0, 60)}" contains "and" — split into separate scenes`,
      );
    }

    // Emotion must be present
    if (!contract.emotion?.trim()) {
      throw new ExecutionContractViolation(
        "MISSING_EMOTION",
        `Scene ${i + 1}: emotionalState is empty — every scene must declare one dominant emotion`,
      );
    }

    // Voice timing must cover this scene
    const timing = voice.timings[i];
    if (!timing) {
      throw new ExecutionContractViolation(
        "MISSING_VOICE_TIMING",
        `Scene ${i + 1}: no voice timing entry — voice timeline is incomplete`,
      );
    }
    if (timing.durationMs <= 0) {
      throw new ExecutionContractViolation(
        "ZERO_SCENE_DURATION",
        `Scene ${i + 1}: voice timing durationMs=${timing.durationMs} — invalid`,
      );
    }

    // Timeline continuity — each scene's start must follow the previous
    const expectedStartMs = cumulativeMs;
    const drift = Math.abs(timing.startMs - expectedStartMs);
    if (drift > 200) { // 200ms tolerance for rounding
      throw new ExecutionContractViolation(
        "TIMELINE_DRIFT",
        `Scene ${i + 1}: startMs=${timing.startMs} but expected ~${expectedStartMs} — ${drift}ms drift exceeds 200ms tolerance`,
      );
    }
    cumulativeMs += timing.durationMs + (timing.pauseAfterMs ?? 0);

    // Characters must be resolved
    if (!contract.characters?.length) {
      throw new ExecutionContractViolation(
        "NO_CHARACTER",
        `Scene ${i + 1}: no characters resolved — check characterIndices in SceneSkeleton`,
      );
    }

    // Prompts must exist
    if (!contract.imagePrompt?.trim() || !contract.videoPrompt?.trim()) {
      throw new ExecutionContractViolation(
        "MISSING_PROMPTS",
        `Scene ${i + 1}: imagePrompt or videoPrompt is empty — contract is incomplete`,
      );
    }
  }

  // ── Rule 4: Total voice duration must cover all scenes ────────────────────
  const contractTotalMs = contracts.reduce((sum, c) => sum + (c.durationSec * 1000), 0);
  const voiceMs         = voice.totalDurationMs;
  const totalDrift      = Math.abs(contractTotalMs - voiceMs);

  if (totalDrift > 1000) { // 1s tolerance for clip rounding
    throw new ExecutionContractViolation(
      "TOTAL_DURATION_MISMATCH",
      `Contract total=${(contractTotalMs / 1000).toFixed(2)}s vs voice=${(voiceMs / 1000).toFixed(2)}s — ${(totalDrift / 1000).toFixed(2)}s drift`,
    );
  }
}

/**
 * Non-throwing version for logging/reporting without halting the pipeline.
 * Returns an array of violation messages (empty = clean).
 */
export function auditExecutionContract(
  contracts: SceneContract[],
  voice:     VoiceEngineResult,
): string[] {
  const violations: string[] = [];
  try {
    validateExecutionContract(contracts, voice);
  } catch (err) {
    if (err instanceof ExecutionContractViolation) {
      violations.push(err.message);
    }
    // Collect remaining violations by re-running individual checks
    for (const c of contracts) {
      if (/\band\b/.test(c.action?.toLowerCase() ?? "")) {
        violations.push(`[COMPOUND_ACTION] scene ${c.index + 1}: "${c.action?.slice(0, 60)}"`);
      }
      if (!c.emotion?.trim()) {
        violations.push(`[MISSING_EMOTION] scene ${c.index + 1}`);
      }
    }
  }
  return violations;
}
