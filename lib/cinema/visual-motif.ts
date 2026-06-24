/**
 * Visual Motif Engine — identifies recurring objects and assigns emotional meaning.
 *
 * Scans all beats for objectsIntroduced. Objects that appear in 2+ beats
 * become motifs. The engine tracks when their emotional meaning transforms.
 *
 * These motifs are injected back into the Beat Director context so the
 * AI knows to show the returning object at the right dramatic moment.
 */

import type { CinematicBeat, VisualMotif } from "./types";

const EMOTIONAL_MEANINGS: Record<string, string[]> = {
  // Objects → [early-meaning, late-meaning (when it transforms)]
  window:       ['isolation, longing',          'opening, possibility'],
  door:         ['barrier, threshold',           'choice, freedom'],
  mirror:       ['self-examination, doubt',      'acceptance, clarity'],
  phone:        ['disconnection, obligation',    'connection, decision'],
  coffee:       ['routine, comfort',             'ritual, grounding'],
  water:        ['uncertainty, emotion',         'flow, release'],
  light:        ['hope, awareness',              'revelation, peace'],
  clock:        ['pressure, constraint',         'release, presence'],
  hands:        ['capability, effort',           'gentleness, letting go'],
  shoes:        ['journey, readiness',           'arrival, rootedness'],
  book:         ['knowledge, escape',            'understanding, wisdom'],
  key:          ['access, control',              'surrender, trust'],
  plant:        ['fragility, growth',            'resilience, life'],
  food:         ['care, nourishment',            'sharing, connection'],
  road:         ['uncertainty, journey',         'direction, commitment'],
  rain:         ['grief, cleansing',             'renewal, acceptance'],
  fire:         ['passion, destruction',         'warmth, illumination'],
  photograph:   ['memory, longing',              'acceptance, gratitude'],
  letter:       ['communication, vulnerability', 'truth, resolution'],
};

const DEFAULT_MEANING = ['presence, significance', 'transformation, weight'];

function findMeaning(object: string, isEarly: boolean): string {
  const key = Object.keys(EMOTIONAL_MEANINGS).find(k =>
    object.toLowerCase().includes(k)
  );
  const pair = EMOTIONAL_MEANINGS[key ?? ''] ?? DEFAULT_MEANING;
  return isEarly ? pair[0] : pair[1];
}

function detectTransformationBeat(
  reappears: number[],
  totalBeats: number,
): number | null {
  // Objects transform at the midpoint of their story presence (approx. climax area)
  if (reappears.length < 2) return null;
  const midpoint = Math.floor(totalBeats * 0.6);
  const nearMid = reappears.find(i => i >= midpoint);
  return nearMid !== undefined ? nearMid : null;
}

export function scanVisualMotifs(beats: CinematicBeat[]): VisualMotif[] {
  const firstAppears: Map<string, number> = new Map();
  const reappearsMap: Map<string, number[]> = new Map();

  for (const beat of beats) {
    for (const obj of beat.objectsIntroduced) {
      const norm = obj.toLowerCase().trim();
      if (!norm) continue;

      if (!firstAppears.has(norm)) {
        firstAppears.set(norm, beat.index);
        reappearsMap.set(norm, []);
      } else {
        const arr = reappearsMap.get(norm)!;
        if (!arr.includes(beat.index)) arr.push(beat.index);
      }
    }
  }

  const motifs: VisualMotif[] = [];

  for (const [obj, first] of firstAppears.entries()) {
    const reappears = reappearsMap.get(obj) ?? [];
    if (reappears.length === 0) continue; // appears once — not a motif

    const transformsAt = detectTransformationBeat(reappears, beats.length);
    const isAnchor = reappears.length >= 2; // 3+ total appearances = anchor symbol

    motifs.push({
      object:           obj,
      firstAppears:     first,
      reappears,
      emotionalMeaning: findMeaning(obj, true),
      isAnchor,
      transformsAt,
    });

    console.log(
      `[VISUAL_MOTIF] "${obj}" first=${first + 1} reappears=[${reappears.map(i => i + 1).join(',')}]` +
      (transformsAt !== null ? ` transforms=scene${transformsAt + 1}` : '') +
      (isAnchor ? ' [ANCHOR]' : ''),
    );
  }

  return motifs;
}

/**
 * Produces a context string for Beat Director injection.
 * Tells the AI which objects have become emotional symbols.
 */
export function describeMotifs(motifs: VisualMotif[]): string {
  if (motifs.length === 0) return '';
  const anchors = motifs.filter(m => m.isAnchor);
  if (anchors.length === 0) return '';

  return `RECURRING VISUAL SYMBOLS: ${anchors
    .map(m =>
      `"${m.object}" (scene ${m.firstAppears + 1}→${m.reappears.map(i => i + 1).join(',')}: ${m.emotionalMeaning}` +
      (m.transformsAt !== null ? `; transforms scene ${m.transformsAt + 1}` : '') + ')'
    )
    .join('. ')}`;
}
