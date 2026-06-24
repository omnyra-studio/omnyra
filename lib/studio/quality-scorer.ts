export interface ClipScore {
  sceneIndex:        number;
  continuity:        number; // 0-1
  faceConsistency:   number; // 0-1
  cameraStability:   number; // 0-1
  motionNaturalness: number; // 0-1
  aestheticQuality:  number; // 0-1
  composite:         number; // weighted final score
  pass:              boolean;
}

// Weights sum to 1.0
const WEIGHTS = {
  continuity:        0.30,
  faceConsistency:   0.25,
  cameraStability:   0.20,
  motionNaturalness: 0.15,
  aestheticQuality:  0.10,
} as const;

const PASS_THRESHOLD = 0.65;

export class QualityScorer {
  score(params: Omit<ClipScore, 'composite' | 'pass'>): ClipScore {
    const composite =
      params.continuity        * WEIGHTS.continuity +
      params.faceConsistency   * WEIGHTS.faceConsistency +
      params.cameraStability   * WEIGHTS.cameraStability +
      params.motionNaturalness * WEIGHTS.motionNaturalness +
      params.aestheticQuality  * WEIGHTS.aestheticQuality;

    return { ...params, composite, pass: composite >= PASS_THRESHOLD };
  }

  /** Heuristic scoring from metadata when vision analysis isn't available. */
  scoreFromMetadata(params: {
    sceneIndex:   number;
    driftScore:   number;
    retries:      number;
    generationMs: number;
    provider:     'kling' | 'runway';
  }): ClipScore {
    const continuity        = Math.max(0, 1 - params.driftScore * 5);
    const cameraStability   = params.retries === 0 ? 0.85 : 0.65;
    const faceConsistency   = Math.max(0, 0.9 - params.driftScore * 3);
    const motionNaturalness = params.provider === 'runway' ? 0.82 : 0.78;
    const aestheticQuality  = params.provider === 'runway' ? 0.84 : 0.80;

    return this.score({
      sceneIndex: params.sceneIndex,
      continuity,
      faceConsistency,
      cameraStability,
      motionNaturalness,
      aestheticQuality,
    });
  }

  bestOf(a: ClipScore, b: ClipScore): ClipScore {
    return a.composite >= b.composite ? a : b;
  }
}
