/**
 * Cinematic Editing Planner — plans cut types between each scene.
 *
 * Uses narrative role, rhythm pace, and emotional shift to choose:
 * hard-cut, match-cut, l-cut, j-cut, crossfade, fade-in, fade-out, hold, smash-cut
 *
 * These cut types are consumed by the stitcher (stitchClipsWithAudio)
 * and mapped to the nearest feasible FFmpeg filter implementation.
 */

import type { CinematicBeat, SceneRhythm, EditingPlan, EditingInstruction, CutType } from "./types";

// Duration of each transition type in milliseconds
const TRANSITION_MS: Record<CutType, number> = {
  'hard-cut':   0,
  'match-cut':  0,
  'l-cut':      0,
  'j-cut':      0,
  'crossfade':  800,
  'fade-in':    600,
  'fade-out':   600,
  'hold':       1500,
  'smash-cut':  0,
};

const AUDIO_HANDLING: Record<CutType, EditingInstruction['audioHandling']> = {
  'hard-cut':  'hard',
  'match-cut': 'hard',
  'l-cut':     'carry-over',  // audio from current continues into next
  'j-cut':     'carry-over',  // audio from next starts before cut
  'crossfade': 'blend',
  'fade-in':   'blend',
  'fade-out':  'silence',
  'hold':      'blend',
  'smash-cut': 'hard',
};

function chooseCutType(
  from: CinematicBeat,
  to:   CinematicBeat,
  fromRhythm: SceneRhythm,
  toRhythm:   SceneRhythm,
): CutType {
  // Smash-cut: climax arrival or sudden high-intensity moment
  if (to.narrativeRole === 'climax' && fromRhythm.pace !== 'fast') return 'smash-cut';

  // Fade-out on final beat
  if (to.narrativeRole === 'resolution') return 'crossfade';

  // Establish → Introduce: slow fade-in feel (smooth world entry)
  if (from.narrativeRole === 'establish') return 'l-cut';

  // Conflict → Reaction: hard cut — the impact must land
  if (from.narrativeRole === 'conflict' && to.narrativeRole === 'reaction') return 'hard-cut';

  // Reaction → Development: j-cut (next scene's audio leads the emotion shift)
  if (from.narrativeRole === 'reaction' && to.narrativeRole === 'development') return 'j-cut';

  // Both slow/hold: crossfade to breathe
  if (fromRhythm.pace === 'slow' && toRhythm.pace === 'slow') return 'crossfade';
  if (fromRhythm.pace === 'hold') return 'crossfade';

  // Fast to fast: hard-cut for momentum
  if (fromRhythm.pace === 'fast' && toRhythm.pace === 'fast') return 'hard-cut';

  // Slow → fast (acceleration): match-cut (visual continuity through speed change)
  if (fromRhythm.pace === 'slow' && toRhythm.pace === 'fast') return 'match-cut';

  // Default: hard-cut
  return 'hard-cut';
}

function annotate(from: CinematicBeat, to: CinematicBeat, cut: CutType): string {
  switch (cut) {
    case 'smash-cut':  return `Impact — ${from.emotion} → ${to.emotion}`;
    case 'match-cut':  return `Visual bridge — ${from.visualObjective} → ${to.visualObjective}`;
    case 'l-cut':      return `Audio carries: "${from.narration}" overlaps into next scene`;
    case 'j-cut':      return `Next audio (${to.narration}) leads before visual cuts`;
    case 'crossfade':  return `Dissolve — ${from.narrativeRole} → ${to.narrativeRole}`;
    case 'hard-cut':   return `Sharp cut on: ${from.transitionTarget || to.visualObjective}`;
    default:           return `${cut}: ${from.narrativeRole} → ${to.narrativeRole}`;
  }
}

export function buildEditingPlan(
  beats:   CinematicBeat[],
  rhythms: SceneRhythm[],
): EditingPlan {
  const instructions: EditingInstruction[] = [];

  for (let i = 0; i < beats.length - 1; i++) {
    const from       = beats[i];
    const to         = beats[i + 1];
    const fromRhythm = rhythms[i];
    const toRhythm   = rhythms[i + 1];

    if (!from || !to || !fromRhythm || !toRhythm) continue;

    const cutType = chooseCutType(from, to, fromRhythm, toRhythm);

    instructions.push({
      fromBeatIndex: i,
      toBeatIndex:   i + 1,
      cutType,
      transitionMs:  TRANSITION_MS[cutType],
      audioHandling: AUDIO_HANDLING[cutType],
      note:          annotate(from, to, cutType),
    });

    console.log(`[EDITING_PLAN] ${i + 1}→${i + 2}: ${cutType} (${TRANSITION_MS[cutType]}ms audio=${AUDIO_HANDLING[cutType]})`);
  }

  // Final scene: fade-out close
  instructions.push({
    fromBeatIndex: beats.length - 1,
    toBeatIndex:   null,
    cutType:       'fade-out',
    transitionMs:  800,
    audioHandling: 'silence',
    note:          'Film end — fade to black',
  });

  const totalDurationMs = instructions.reduce((sum, i) => sum + i.transitionMs, 0);

  return {
    instructions,
    openingFadeMs:   600,
    closingFadeMs:   800,
    totalDurationMs,
  };
}

/**
 * Summary of editing plan for logging/debugging.
 */
export function describeEditingPlan(plan: EditingPlan): string {
  return plan.instructions
    .map(i =>
      i.toBeatIndex !== null
        ? `${i.fromBeatIndex + 1}→${i.toBeatIndex + 1}: ${i.cutType}`
        : `${i.fromBeatIndex + 1}→END: ${i.cutType}`
    )
    .join(' | ');
}
