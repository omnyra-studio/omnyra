/**
 * Film Rhythm Engine — controls pacing between scenes.
 *
 * Makes videos feel edited, not generated.
 * Plans: holds, cut timing, narrative pressure per beat.
 *
 * Rule: Never 3+ identical pace values in a row.
 * Rule: Second half of film always faster than first half.
 * Rule: Climax is always the fastest beat.
 * Rule: Hold beats allow the audience to breathe.
 */

import type { CinematicBeat, SceneRhythm, RhythmPace, DirectorIntent, FilmPace } from "./types";

const CLIMAX_ROLES    = new Set(['climax']);
const SLOW_ROLES      = new Set(['establish', 'resolution']);
const FAST_ROLES      = new Set(['conflict', 'reaction']);

// Base hold durations per pace (seconds the scene "breathes" before cut)
const HOLD_SECONDS: Record<RhythmPace, number> = {
  still:  5.0,
  slow:   3.0,
  medium: 1.5,
  fast:   0.5,
  hold:   4.0,
};

export function planFilmRhythm(
  beats:  CinematicBeat[],
  intent: DirectorIntent,
): SceneRhythm[] {
  const total = beats.length;
  const paces = assignBasePaces(beats, intent.pace);
  const paces2 = enforceEvolution(paces, beats);

  return beats.map((beat, i) => {
    const pace = paces2[i];
    const position = total > 1 ? i / (total - 1) : 0; // 0 = first, 1 = last

    // Narrative pressure rises toward climax then releases at resolution
    const peakIndex = beats.findIndex(b => b.narrativeRole === 'climax');
    const peak = peakIndex >= 0 ? peakIndex / (total - 1) : 0.75;
    const narrativePressure = position <= peak
      ? position / peak
      : 1 - ((position - peak) / (1 - peak));

    // Cut timing: slow/still = delayed (let scene breathe), fast = immediate
    const cutTiming: SceneRhythm['cutTiming'] =
      pace === 'still' || pace === 'hold'  ? 'delayed'
      : pace === 'slow'                    ? 'on-beat'
      :                                      'immediate';

    return {
      beatIndex:         i,
      pace,
      holdSeconds:       HOLD_SECONDS[pace],
      cutTiming,
      narrativePressure: Math.max(0, Math.min(1, narrativePressure)),
    };
  });
}

function assignBasePaces(beats: CinematicBeat[], intentPace: FilmPace): RhythmPace[] {
  return beats.map((beat, i) => {
    const total    = beats.length;
    const position = total > 1 ? i / (total - 1) : 0;

    // Role-based primary assignment
    if (CLIMAX_ROLES.has(beat.narrativeRole)) return 'fast';
    if (SLOW_ROLES.has(beat.narrativeRole))   return i === 0 ? 'slow' : 'medium';
    if (FAST_ROLES.has(beat.narrativeRole))   return 'medium';

    // Intent-driven pacing
    switch (intentPace) {
      case 'slow':           return 'slow';
      case 'fast':           return position > 0.3 ? 'fast' : 'medium';
      case 'slow-then-fast': return position < 0.5 ? 'slow' : position < 0.8 ? 'medium' : 'fast';
      case 'fast-then-slow': return position < 0.5 ? 'fast' : 'slow';
      default:               return 'medium';
    }
  });
}

function enforceEvolution(paces: RhythmPace[], beats: CinematicBeat[]): RhythmPace[] {
  const result = [...paces];
  const ROTATION: RhythmPace[] = ['slow', 'medium', 'fast', 'hold', 'medium', 'slow'];

  for (let i = 2; i < result.length; i++) {
    // If three in a row are the same and it's not a climax
    if (
      result[i] === result[i - 1] &&
      result[i] === result[i - 2] &&
      beats[i].narrativeRole !== 'climax'
    ) {
      const cur = ROTATION.indexOf(result[i]);
      result[i] = ROTATION[(cur + 1) % ROTATION.length];
      console.log(`[FILM_RHYTHM] scene=${i + 1} pace evolved to "${result[i]}" to break repetition`);
    }
  }

  // Insert a natural "hold" somewhere in the first half if none exists
  const firstHalfEnd = Math.floor(beats.length / 2);
  const hasHoldInFirstHalf = result.slice(0, firstHalfEnd).some(p => p === 'hold' || p === 'slow');
  if (!hasHoldInFirstHalf && firstHalfEnd > 1) {
    result[1] = 'slow'; // Scene 2 breathes after establish
    console.log(`[FILM_RHYTHM] inserted breathing room at scene 2`);
  }

  return result;
}

/**
 * Describes the rhythm in human-readable form for Beat Director context injection.
 */
export function describeRhythm(rhythms: SceneRhythm[]): string {
  return rhythms
    .map((r, i) => `Scene ${i + 1}: ${r.pace} (hold ${r.holdSeconds}s, pressure ${Math.round(r.narrativePressure * 100)}%)`)
    .join(' | ');
}
