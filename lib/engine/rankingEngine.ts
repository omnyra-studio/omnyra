// Pure ranking engine — sorts scored variants and selects the recommendation.
// Does not modify scores. Deterministic for the same input.

export interface RankableVariant {
  id: string;
  scores: {
    finalScore: number;
  };
}

export interface RankedResult<T extends RankableVariant> {
  ranked: T[];
  recommendedId: string;
}

export function rankVariants<T extends RankableVariant>(
  variants: T[],
): RankedResult<T> {
  if (!variants.length) {
    throw new Error("[rankingEngine] Cannot rank empty variants array");
  }

  const ranked = variants
    .slice() // never mutate input
    .sort((a, b) => b.scores.finalScore - a.scores.finalScore);

  const recommendedId = ranked[0]!.id;

  return { ranked, recommendedId };
}

export function getRecommended<T extends RankableVariant>(variants: T[]): T {
  const { ranked } = rankVariants(variants);
  return ranked[0]!;
}
