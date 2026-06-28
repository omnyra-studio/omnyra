/**
 * Temporal Ledger — Global Sync Tracking
 *
 * Tracks every millisecond of overhead across scenes and transitions.
 * Prevents the "almost correct but slightly off" sync drift.
 * Applied during assembly to achieve deterministic audio-video alignment.
 *
 * Strategy selection is deterministic — no guessing at assembly time.
 */

import type { SceneContract, TemporalLedger, TemporalLedgerEntry } from "./types";

const TRANSITION_DURATIONS_MS: Record<string, number> = {
  cut:       0,
  fade:      300,
  match_cut: 0,
  l_cut:     0,
  j_cut:     0,
};

// ── Build ledger from contracts ───────────────────────────────────────────────
// Called after contracts are compiled. Actual clip durations updated post-generation.

export function buildLedger(contracts: SceneContract[]): TemporalLedger {
  const entries: TemporalLedgerEntry[] = contracts.map(c => {
    const transitionMs = TRANSITION_DURATIONS_MS[c.transitionOut] ?? 0;
    const clipRequestedMs = c.clipDurationSec * 1000;
    const syncOffsetMs    = clipRequestedMs - c.durationSec * 1000;

    return {
      sceneIndex:              c.index,
      voiceStartMs:            c.voiceStartMs,
      voiceEndMs:              c.voiceEndMs,
      voiceDurationMs:         c.durationSec * 1000,
      clipRequestedDurationMs: clipRequestedMs,
      clipActualDurationMs:    undefined,              // filled in after generation
      transitionDurationMs:    transitionMs,
      syncOffsetMs,
      correctedDurationMs:     clipRequestedMs,        // initial — updated by reconcile()
    };
  });

  return reconcile(entries);
}

// ── Update with actual clip durations (post-generation) ───────────────────────

export function recordActualDurations(
  ledger:         TemporalLedger,
  actualDurationsMs: (number | undefined)[],
): TemporalLedger {
  const updated = ledger.entries.map((entry, i) => ({
    ...entry,
    clipActualDurationMs: actualDurationsMs[i] ?? entry.clipRequestedDurationMs,
  }));

  return reconcile(updated);
}

// ── Reconciliation — compute assembly strategy ────────────────────────────────

function reconcile(entries: TemporalLedgerEntry[]): TemporalLedger {
  const totalVoiceMs     = entries.reduce((s, e) => s + e.voiceDurationMs,         0);
  const totalClipMs      = entries.reduce((s, e) => s + (e.clipActualDurationMs ?? e.clipRequestedDurationMs), 0);
  const totalTransMs     = entries.reduce((s, e) => s + e.transitionDurationMs,    0);
  const cumulativeDriftMs = totalClipMs - totalVoiceMs;

  // Determine assembly strategy
  let strategy: TemporalLedger["assemblyStrategy"];
  const driftSec = cumulativeDriftMs / 1000;

  if (Math.abs(driftSec) < 0.1) {
    strategy = "exact";
  } else if (driftSec > 0) {
    // Video longer than voice — trim last clip to exact duration
    strategy = "trim_last";
  } else if (driftSec > -2) {
    // Voice slightly longer — extend last clip (Runway will loop/hold)
    strategy = "extend_last";
  } else {
    // Voice much longer — pad with silence at end
    strategy = "pad_silence";
  }

  // Compute corrected durations — redistribute drift across clips
  const correctedEntries = distributeCorrection(entries, cumulativeDriftMs);

  console.log(
    `[LEDGER] totalVoice=${(totalVoiceMs/1000).toFixed(2)}s ` +
    `totalClip=${(totalClipMs/1000).toFixed(2)}s ` +
    `drift=${(cumulativeDriftMs/1000).toFixed(2)}s ` +
    `strategy=${strategy}`
  );

  return {
    totalVoiceDurationMs:      totalVoiceMs,
    totalClipDurationMs:       totalClipMs,
    totalTransitionOverheadMs: totalTransMs,
    cumulativeDriftMs,
    entries:                   correctedEntries,
    assemblyStrategy:          strategy,
  };
}

// Distribute drift correction — adjust correctedDurationMs per entry
function distributeCorrection(
  entries:          TemporalLedgerEntry[],
  totalDriftMs:     number,
): TemporalLedgerEntry[] {
  if (entries.length === 0) return entries;

  const corrected = entries.map(e => ({ ...e }));

  // Apply all correction to the last clip to preserve scene boundaries
  const last = corrected[corrected.length - 1];
  const base = last.clipActualDurationMs ?? last.clipRequestedDurationMs;
  last.correctedDurationMs = Math.max(1000, base - totalDriftMs); // never below 1s

  // All other clips: correctedDuration = actual duration
  for (let i = 0; i < corrected.length - 1; i++) {
    corrected[i].correctedDurationMs =
      corrected[i].clipActualDurationMs ?? corrected[i].clipRequestedDurationMs;
  }

  return corrected;
}

// ── FFmpeg filter generation ───────────────────────────────────────────────────
// Generates the -t trim flags per clip based on ledger corrections

export function generateTrimFlags(ledger: TemporalLedger): string[] {
  return ledger.entries.map(entry => {
    const durationSec = entry.correctedDurationMs / 1000;
    return `-t ${durationSec.toFixed(3)}`;
  });
}

// ── Verify ledger post-assembly ───────────────────────────────────────────────

export function verifyLedger(
  ledger:           TemporalLedger,
  assembledDurationMs: number,
): { valid: boolean; error?: string } {
  const diff = Math.abs(assembledDurationMs - ledger.totalVoiceDurationMs);
  if (diff > 500) {
    return {
      valid: false,
      error: `Assembly duration ${(assembledDurationMs/1000).toFixed(2)}s differs from voice ${(ledger.totalVoiceDurationMs/1000).toFixed(2)}s by ${(diff/1000).toFixed(2)}s — exceeds 500ms tolerance`,
    };
  }
  return { valid: true };
}
