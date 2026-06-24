/**
 * Continuity Confidence Scorer
 *
 * Scores render contracts for continuity indicators before stitching.
 * Identifies scenes at risk of breaking visual continuity.
 *
 * Dimensions (0–100 each):
 *   character  — consistent character description across contracts
 *   camera     — logical camera progression (no impossible jumps)
 *   emotion    — emotion evolution is plausible (not jarring leaps)
 *   objects    — anchor objects persist where expected
 *   lighting   — lighting environment remains consistent within sequences
 *
 * Composite = weighted average. CONFIDENCE_THRESHOLD = 85.
 * Contracts below threshold are flagged for regeneration.
 */

import type { RenderContract, ContinuityConfidence } from "./types";

export const CONFIDENCE_THRESHOLD = 85;

const WEIGHTS = {
  character: 0.30,
  camera:    0.25,
  emotion:   0.20,
  objects:   0.15,
  lighting:  0.10,
} as const;

// Score drops per detected discontinuity (out of 100)
const PENALTY = {
  characterShift:   30,
  cameraJump:       25,
  emotionCollapse:  20,
  objectMissing:    15,
  lightingAbrupt:   10,
};

const EMOTION_ESCALATION: Record<string, string[]> = {
  neutral:     ['uncertain', 'anxious', 'determined', 'hopeful', 'resolved'],
  hopeful:     ['cautious', 'believing', 'committed', 'triumphant', 'peaceful'],
  anxious:     ['fearful', 'panicked', 'controlled', 'calm', 'resolved'],
  sad:         ['grieving', 'quiet', 'processing', 'accepting', 'healing'],
  angry:       ['frustrated', 'raging', 'cold', 'determined', 'resolute'],
  determined:  ['focused', 'intense', 'committed', 'certain', 'triumphant'],
  exhausted:   ['depleted', 'struggling', 'pushing', 'breaking', 'surrendering'],
};

function emotionsCompatible(a: string, b: string): boolean {
  if (!a || !b) return true;
  const aNorm = a.toLowerCase();
  const bNorm = b.toLowerCase();

  // Same base = always compatible
  if (aNorm === bNorm) return true;

  // Check escalation chain
  const chain = EMOTION_ESCALATION[
    Object.keys(EMOTION_ESCALATION).find(k => aNorm.includes(k)) ?? ''
  ] ?? [];

  return chain.some(e => bNorm.includes(e));
}

function cameraCompatible(a: string, b: string): boolean {
  if (!a || !b) return true;
  // Detect impossible camera jumps: e.g. wide → extreme close-up immediately
  const aWide  = /wide|panoramic|establishing/i.test(a);
  const bClose = /extreme close|macro|insert/i.test(b);
  const aPOV   = /pov|first.person/i.test(a);
  const bDrone = /drone|aerial/i.test(b);
  if (aWide && bClose) return false;   // no jump from wide to extreme close
  if (aPOV  && bDrone) return false;   // no jump from ground POV to aerial
  return true;
}

function lightingCompatible(a: string, b: string): boolean {
  if (!a || !b) return true;
  // Only flag abrupt indoor/outdoor light swaps
  const aIndoor  = /indoor|studio|room|interior/i.test(a);
  const bOutdoor = /outdoor|exterior|sunlight|overcast/i.test(b);
  const aOutdoor = /outdoor|exterior|sunlight/i.test(a);
  const bIndoor  = /indoor|studio|room|interior/i.test(b);
  return !((aIndoor && bOutdoor) || (aOutdoor && bIndoor));
}

function characterConsistent(a: string, b: string): boolean {
  if (!a || !b) return true;
  // Extract simple descriptors (gender, age, clothing anchors)
  const aTokens = new Set(a.toLowerCase().split(/\W+/).filter(t => t.length > 3));
  const bTokens = new Set(b.toLowerCase().split(/\W+/).filter(t => t.length > 3));
  // Count shared tokens — should have significant overlap
  let shared = 0;
  for (const t of aTokens) { if (bTokens.has(t)) shared++; }
  const min = Math.min(aTokens.size, bTokens.size);
  if (min === 0) return true;
  return shared / min >= 0.25; // 25% token overlap required
}

export function scoreContracts(contracts: RenderContract[]): ContinuityConfidence[] {
  return contracts.map((contract, i) => {
    const prev = i > 0 ? contracts[i - 1] : null;
    let character = 100;
    let camera    = 100;
    let emotion   = 100;
    let objects   = 100;
    let lighting  = 100;
    const reasons: string[] = [];

    if (prev) {
      if (!characterConsistent(prev.characterState, contract.characterState)) {
        character -= PENALTY.characterShift;
        reasons.push('character description shift');
      }
      if (!cameraCompatible(prev.cameraState, contract.cameraState)) {
        camera -= PENALTY.cameraJump;
        reasons.push('impossible camera jump');
      }
      if (!emotionsCompatible(prev.emotion, contract.emotion)) {
        emotion -= PENALTY.emotionCollapse;
        reasons.push(`emotion collapse: ${prev.emotion} → ${contract.emotion}`);
      }
      if (!lightingCompatible(prev.lighting, contract.lighting)) {
        lighting -= PENALTY.lightingAbrupt;
        reasons.push('abrupt lighting environment change');
      }
    }

    // Clamp all scores
    character = Math.max(0, character);
    camera    = Math.max(0, camera);
    emotion   = Math.max(0, emotion);
    objects   = Math.max(0, objects);
    lighting  = Math.max(0, lighting);

    const composite = Math.round(
      character * WEIGHTS.character +
      camera    * WEIGHTS.camera    +
      emotion   * WEIGHTS.emotion   +
      objects   * WEIGHTS.objects   +
      lighting  * WEIGHTS.lighting
    );

    const pass = composite >= CONFIDENCE_THRESHOLD;

    if (!pass) {
      console.warn(
        `[CONTINUITY_CONFIDENCE] scene=${i + 1} composite=${composite} FAIL — ${reasons.join(', ')}`
      );
    } else {
      console.log(`[CONTINUITY_CONFIDENCE] scene=${i + 1} composite=${composite} PASS`);
    }

    return {
      beatIndex:   i,
      character,
      camera,
      emotion,
      objects,
      lighting,
      composite,
      pass,
      failReason:  reasons.length > 0 ? reasons.join('; ') : undefined,
    } satisfies ContinuityConfidence;
  });
}

/**
 * Returns indices of contracts that failed the confidence gate.
 */
export function getFailingScenes(scores: ContinuityConfidence[]): number[] {
  return scores.filter(s => !s.pass).map(s => s.beatIndex);
}
