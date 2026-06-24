/**
 * Story Validator — ensures every scene advances the story.
 *
 * For each scene node, checks:
 *   1. Does it advance the narrative?
 *   2. Does it introduce new information or visual content?
 *   3. Does it avoid repeating the previous scene's action?
 *   4. Does it move the emotional arc forward?
 *
 * Returns validation results + repairs where possible.
 */

import type { CinematicBeat, NarrativeRole } from "./types";

export interface ValidationResult {
  index:    number;
  passed:   boolean;
  issues:   string[];
  repaired: boolean;
}

// Narrative roles must form a valid arc — not jump backwards
const ROLE_ORDER: Record<NarrativeRole, number> = {
  establish:   0,
  introduce:   1,
  conflict:    2,
  reaction:    3,
  development: 4,
  climax:      5,
  resolution:  6,
};

export function validateStoryArc(beats: CinematicBeat[]): ValidationResult[] {
  const results: ValidationResult[] = [];

  for (let i = 0; i < beats.length; i++) {
    const cur    = beats[i];
    const prev   = beats[i - 1] ?? null;
    const issues: string[] = [];

    if (prev) {
      // Emotional arc must evolve (no flat-lining)
      if (cur.emotion.trim().toLowerCase() === prev.emotion.trim().toLowerCase()) {
        issues.push(`Emotion "${cur.emotion}" is unchanged from scene ${i}`);
      }

      // Character action must differ
      if (cur.characterAction.trim().toLowerCase() === prev.characterAction.trim().toLowerCase()) {
        issues.push(`Character action identical to scene ${i}`);
      }

      // Narrative progression must not be empty
      if (!cur.narrativeProgression.trim()) {
        issues.push(`Scene ${i + 1} has no narrative progression defined`);
      }

      // Resolution should not appear before climax
      const curOrder  = ROLE_ORDER[cur.narrativeRole]  ?? 0;
      const prevOrder = ROLE_ORDER[prev.narrativeRole] ?? 0;
      if (cur.narrativeRole === 'establish' && i > 0) {
        issues.push(`Narrative role "establish" cannot appear after scene 1`);
      }
      if (curOrder < prevOrder - 2) {
        issues.push(`Narrative role "${cur.narrativeRole}" jumps backward in arc after "${prev.narrativeRole}"`);
      }
    }

    // Every scene must have a visual objective
    if (!cur.visualObjective.trim()) {
      issues.push(`Scene ${i + 1} missing visual objective`);
    }

    // Every scene must have a character action
    if (!cur.characterAction.trim()) {
      issues.push(`Scene ${i + 1} missing character action`);
    }

    results.push({
      index:    i,
      passed:   issues.length === 0,
      issues,
      repaired: false,
    });
  }

  return results;
}

export function repairStoryArc(
  beats: CinematicBeat[],
  results: ValidationResult[],
): CinematicBeat[] {
  const repaired = beats.map(b => ({ ...b }));

  for (const r of results) {
    if (r.passed) continue;
    const beat = repaired[r.index];
    const prev = repaired[r.index - 1];
    if (!beat) continue;

    for (const issue of r.issues) {
      if (issue.includes('Emotion') && issue.includes('unchanged') && prev) {
        beat.emotion = deepenEmotion(prev.emotion, r.index);
        console.log(`[STORY_REPAIR] scene=${r.index + 1} deepened emotion → "${beat.emotion}"`);
      }

      if (issue.includes('Character action identical') && prev) {
        beat.characterAction = escalateAction(beat.characterAction, beat.emotion);
        console.log(`[STORY_REPAIR] scene=${r.index + 1} escalated action → "${beat.characterAction.slice(0, 60)}"`);
      }

      if (issue.includes('no narrative progression')) {
        beat.narrativeProgression = prev
          ? `Continues from "${prev.purpose}" — deepens the stakes`
          : 'Opens the story';
      }

      if (issue.includes('missing visual objective')) {
        beat.visualObjective = `${beat.characterAction} in ${beat.environment}`;
      }
    }

    r.repaired = true;
  }

  return repaired;
}

function deepenEmotion(emotion: string, index: number): string {
  const modifiers = ['deeper', 'quiet', 'raw', 'controlled', 'breaking', 'resolving'];
  const mod = modifiers[index % modifiers.length];
  return `${mod} ${emotion}`;
}

function escalateAction(action: string, emotion: string): string {
  const escalations = [
    `Slower, more deliberate version of: ${action}`,
    `Reacts to consequence: ${action}`,
    `Final, definitive: ${action}`,
  ];
  void emotion;
  return escalations[Math.floor(Math.random() * escalations.length)];
}
