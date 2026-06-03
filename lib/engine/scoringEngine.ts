// Pure, deterministic scoring engine — no randomness, no external calls.
// Computes finalScore for any variant with scrollHold, sharePotential, messageStrength.

export interface ScoredVariant {
  id: string;
  scores: {
    scrollHold:      number;
    sharePotential:  number;
    messageStrength: number;
    finalScore:      number;
  };
}

export interface RawScores {
  scrollHold:      number;
  sharePotential:  number;
  messageStrength: number;
}

export function computeFinalScore(scores: RawScores): number {
  const { scrollHold, sharePotential, messageStrength } = scores;
  return Math.round(
    scrollHold      * 0.4 +
    sharePotential  * 0.3 +
    messageStrength * 0.3,
  );
}

export function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function scoreVariant<T extends { id: string; scores: RawScores }>(
  variant: T,
): T & { scores: RawScores & { finalScore: number } } {
  const scores = {
    scrollHold:      clampScore(variant.scores.scrollHold),
    sharePotential:  clampScore(variant.scores.sharePotential),
    messageStrength: clampScore(variant.scores.messageStrength),
    finalScore:      0,
  };
  scores.finalScore = computeFinalScore(scores);

  return { ...variant, scores };
}

export function scoreAll<T extends { id: string; scores: RawScores }>(
  variants: T[],
): Array<T & { scores: RawScores & { finalScore: number } }> {
  return variants.map(scoreVariant);
}
