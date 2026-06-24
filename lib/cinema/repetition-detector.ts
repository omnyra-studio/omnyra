/**
 * Repetition Detector — scans consecutive scene graph nodes for sameness.
 *
 * Compares: action, framing (shot type), emotional purpose, visual objective.
 * Flags repeated dimensions. The pipeline auto-repairs before rendering.
 */

import type { CinematicBeat, ShotPlan, RepetitionFlag } from "./types";

const SIMILARITY_THRESHOLD = 0.72;

function tokenSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const tokA = new Set(a.toLowerCase().split(/\W+/).filter(t => t.length > 3));
  const tokB = new Set(b.toLowerCase().split(/\W+/).filter(t => t.length > 3));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokA) { if (tokB.has(t)) overlap++; }
  return overlap / Math.max(tokA.size, tokB.size);
}

export function detectRepetitions(
  beats: CinematicBeat[],
  shots: ShotPlan[],
): RepetitionFlag[] {
  const flags: RepetitionFlag[] = [];

  for (let i = 1; i < beats.length; i++) {
    const cur  = beats[i];
    const prev = beats[i - 1];
    const curShot  = shots[i];
    const prevShot = shots[i - 1];

    // Action repetition
    if (tokenSimilarity(cur.characterAction, prev.characterAction) >= SIMILARITY_THRESHOLD) {
      flags.push({ nodeIndex: i, dimension: 'action', description: `Action "${cur.characterAction.slice(0, 60)}" repeats scene ${i}` });
    }

    // Framing repetition (shot type)
    if (curShot?.shotType === prevShot?.shotType) {
      flags.push({ nodeIndex: i, dimension: 'framing', description: `Shot type "${curShot.shotType}" repeats consecutively` });
    }

    // Emotion repetition (exact match)
    if (cur.emotion.toLowerCase().trim() === prev.emotion.toLowerCase().trim()) {
      flags.push({ nodeIndex: i, dimension: 'emotion', description: `Emotion "${cur.emotion}" unchanged from previous beat` });
    }

    // Purpose / visual objective repetition
    if (tokenSimilarity(cur.purpose, prev.purpose) >= SIMILARITY_THRESHOLD) {
      flags.push({ nodeIndex: i, dimension: 'purpose', description: `Purpose "${cur.purpose.slice(0, 60)}" repeats scene ${i}` });
    }
  }

  return flags;
}

/**
 * Applies automatic corrections to beats that have been flagged.
 * Returns a new beats array with modifications applied.
 */
export function repairRepetitions(
  beats: CinematicBeat[],
  flags: RepetitionFlag[],
): CinematicBeat[] {
  const repaired = beats.map(b => ({ ...b }));

  for (const flag of flags) {
    const beat = repaired[flag.nodeIndex];
    if (!beat) continue;

    if (flag.dimension === 'action') {
      // Shift from physical action to internal/reaction
      beat.characterAction = shiftToReaction(beat.characterAction, beat.emotion);
      beat.cameraIntention = 'Tighter framing to reveal what the previous action produced';
    }

    if (flag.dimension === 'emotion') {
      beat.emotion = evolveEmotion(beat.emotion, flag.nodeIndex);
    }

    if (flag.dimension === 'purpose') {
      beat.purpose = `Deepen: ${beat.purpose}`;
      beat.narrativeProgression = `Escalates from previous — ${beat.narrativeProgression}`;
    }

    console.log(`[REPETITION_REPAIR] scene=${flag.nodeIndex + 1} dim=${flag.dimension} → repaired`);
  }

  return repaired;
}

function shiftToReaction(action: string, emotion: string): string {
  const reactions: Record<string, string> = {
    sad:         "Subject jaw tightens, eyes glisten, breath held",
    happy:       "Subject exhales slowly, shoulders drop, faint smile breaks",
    angry:       "Subject hands grip the surface, knuckles pale",
    anxious:     "Subject gaze flicks to the side, swallows hard",
    determined:  "Subject chin lifts, eyes lock forward with resolve",
    hopeful:     "Subject tilts head up slightly, breath deepens",
    afraid:      "Subject freezes mid-motion, eyes widen, shoulders pull back",
    exhausted:   "Subject sags against nearest surface, eyes close briefly",
  };
  const emotionKey = Object.keys(reactions).find(k => emotion.toLowerCase().includes(k));
  return reactions[emotionKey ?? ''] ?? `Subject reacts to ${action}: stillness follows movement`;
}

const EMOTION_ESCALATIONS: Record<string, string[]> = {
  sad:         ['quiet despair', 'grief', 'acceptance', 'fragile peace'],
  happy:       ['tentative joy', 'relief', 'warm happiness', 'deep contentment'],
  angry:       ['frustration', 'quiet rage', 'cold determination', 'weary resolve'],
  anxious:     ['unease', 'dread', 'controlled fear', 'fragile calm'],
  determined:  ['focus', 'fierce resolve', 'controlled intensity', 'quiet certainty'],
  hopeful:     ['cautious hope', 'rising belief', 'conviction', 'quiet triumph'],
  afraid:      ['dread', 'controlled panic', 'desperate calm', 'numb acceptance'],
  neutral:     ['curious', 'unsettled', 'reflective', 'quietly intense'],
};

function evolveEmotion(emotion: string, index: number): string {
  const key = Object.keys(EMOTION_ESCALATIONS).find(k => emotion.toLowerCase().includes(k));
  const chain = EMOTION_ESCALATIONS[key ?? 'neutral'];
  return chain[index % chain.length] ?? emotion;
}
