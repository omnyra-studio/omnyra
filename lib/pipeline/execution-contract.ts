/**
 * Execution Contract — advisory checks only.
 *
 * All violations are logged as warnings. Nothing here throws.
 * Generation always continues — contracts are diagnostic, not gates.
 */

import type { SceneContract, VoiceEngineResult } from "./types";

// ── Error class kept for catch-site compatibility in engine.ts ────────────────

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
 * Validates contracts against voice timing.
 * Never throws — all violations are console.warn only.
 */
export function validateExecutionContract(
  contracts: SceneContract[],
  voice:     VoiceEngineResult,
): void {
  // Rule 1: Voice must be locked
  if (!voice.audioUrl) {
    console.warn("[EXECUTION_CONTRACT:VOICE_NOT_LOCKED] Voice audioUrl is empty — continuing anyway");
  }
  if (voice.totalDurationMs <= 0) {
    console.warn(`[EXECUTION_CONTRACT:VOICE_DURATION_ZERO] totalDurationMs=${voice.totalDurationMs} — continuing anyway`);
  }

  // Rule 2: Scene count vs voice timing entries
  if (contracts.length !== voice.timings.length) {
    console.warn(`[EXECUTION_CONTRACT:SCENE_VOICE_COUNT_MISMATCH] ${contracts.length} contracts vs ${voice.timings.length} voice timings — continuing anyway`);
  }

  // Rule 3: Per-scene checks
  let cumulativeMs = 0;
  for (const contract of contracts) {
    const i = contract.index;

    if (!contract.action?.trim()) {
      console.warn(`[EXECUTION_CONTRACT:EMPTY_ACTION] Scene ${i + 1}: actionUnit is empty — continuing anyway`);
    }

    if (
      /\b(and then|after that|then|before|while also)\b/i.test(contract.action ?? "") &&
      (contract.action?.length ?? 0) > 70
    ) {
      console.warn(`[COMPOUND_ACTION_IGNORED] Scene ${i + 1}: "${contract.action?.slice(0, 60)}" — continuing despite compound action`);
    }

    if (!contract.emotion?.trim()) {
      console.warn(`[EXECUTION_CONTRACT:MISSING_EMOTION] Scene ${i + 1}: emotionalState is empty — continuing anyway`);
    }

    const timing = voice.timings[i];
    if (!timing) {
      console.warn(`[EXECUTION_CONTRACT:MISSING_VOICE_TIMING] Scene ${i + 1}: no voice timing entry — continuing anyway`);
      cumulativeMs += (contract.durationSec ?? 10) * 1000;
      continue;
    }
    if (timing.durationMs <= 0) {
      console.warn(`[EXECUTION_CONTRACT:ZERO_SCENE_DURATION] Scene ${i + 1}: durationMs=${timing.durationMs} — continuing anyway`);
    }

    const expectedStartMs = cumulativeMs;
    const drift = Math.abs(timing.startMs - expectedStartMs);
    if (drift > 200) {
      console.warn(`[TIMELINE_DRIFT_IGNORED] Scene ${i + 1}: startMs=${timing.startMs} expected ~${expectedStartMs} — ${drift}ms drift — continuing`);
    }
    cumulativeMs += timing.durationMs + (timing.pauseAfterMs ?? 0);

    if (!contract.characters?.length) {
      console.warn(`[EXECUTION_CONTRACT:NO_CHARACTER] Scene ${i + 1}: no characters resolved — continuing anyway`);
    }

    if (!contract.imagePrompt?.trim() || !contract.videoPrompt?.trim()) {
      console.warn(`[EXECUTION_CONTRACT:MISSING_PROMPTS] Scene ${i + 1}: imagePrompt or videoPrompt empty — continuing anyway`);
    }
  }

  // Rule 4: Total duration drift
  const contractTotalMs = contracts.reduce((sum, c) => sum + (c.durationSec * 1000), 0);
  const voiceMs         = voice.totalDurationMs;
  const totalDrift      = Math.abs(contractTotalMs - voiceMs);
  if (totalDrift > 1000) {
    console.warn(`[EXECUTION_CONTRACT:TOTAL_DURATION_MISMATCH] contract=${(contractTotalMs / 1000).toFixed(2)}s voice=${(voiceMs / 1000).toFixed(2)}s drift=${(totalDrift / 1000).toFixed(2)}s — continuing anyway`);
  }
}

/**
 * Non-throwing audit — returns violation messages for reporting.
 */
export function auditExecutionContract(
  contracts: SceneContract[],
  voice:     VoiceEngineResult,
): string[] {
  const violations: string[] = [];

  if (!voice.audioUrl) violations.push("[VOICE_NOT_LOCKED]");
  if (voice.totalDurationMs <= 0) violations.push(`[VOICE_DURATION_ZERO] ${voice.totalDurationMs}ms`);
  if (contracts.length !== voice.timings.length) {
    violations.push(`[SCENE_VOICE_COUNT_MISMATCH] ${contracts.length} vs ${voice.timings.length}`);
  }

  let cumulativeMs = 0;
  for (const c of contracts) {
    const i = c.index;
    if (!c.action?.trim()) violations.push(`[EMPTY_ACTION] scene ${i + 1}`);
    if (
      /\b(and then|after that|then|before|while also)\b/i.test(c.action ?? "") &&
      (c.action?.length ?? 0) > 70
    ) {
      violations.push(`[COMPOUND_ACTION] scene ${i + 1}: "${c.action?.slice(0, 60)}"`);
    }
    if (!c.emotion?.trim()) violations.push(`[MISSING_EMOTION] scene ${i + 1}`);

    const timing = voice.timings[i];
    if (!timing) { violations.push(`[MISSING_VOICE_TIMING] scene ${i + 1}`); cumulativeMs += (c.durationSec ?? 10) * 1000; continue; }
    if (timing.durationMs <= 0) violations.push(`[ZERO_SCENE_DURATION] scene ${i + 1}`);
    const drift = Math.abs(timing.startMs - cumulativeMs);
    if (drift > 200) violations.push(`[TIMELINE_DRIFT] scene ${i + 1}: ${drift}ms`);
    cumulativeMs += timing.durationMs + (timing.pauseAfterMs ?? 0);

    if (!c.characters?.length) violations.push(`[NO_CHARACTER] scene ${i + 1}`);
    if (!c.imagePrompt?.trim() || !c.videoPrompt?.trim()) violations.push(`[MISSING_PROMPTS] scene ${i + 1}`);
  }

  const contractTotalMs = contracts.reduce((sum, c) => sum + (c.durationSec * 1000), 0);
  const totalDrift = Math.abs(contractTotalMs - voice.totalDurationMs);
  if (totalDrift > 1000) violations.push(`[TOTAL_DURATION_MISMATCH] ${(totalDrift / 1000).toFixed(2)}s`);

  return violations;
}
