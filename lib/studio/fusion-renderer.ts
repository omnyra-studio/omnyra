import { generateRunwayClip }        from "@/lib/services/runway";
import { generateKlingClip }         from "@/lib/providers/kling-direct";
import { QualityScorer, ClipScore }  from "./quality-scorer";

export interface FusionResult {
  videoUrl:     string;
  provider:     'kling' | 'runway';
  score:        ClipScore;
  generationMs: number;
}

export interface FusionParams {
  sceneIndex:  number;
  prompt:      string;
  imageUrl?:   string;
  duration:    5 | 10;
  aspectRatio: '9:16' | '16:9';
  klingParams?: {
    negativePrompt?: string;
    mode?:           'std' | 'pro';
  };
}

const scorer = new QualityScorer();

/**
 * Renders the same scene with both Runway and Kling in parallel,
 * then returns whichever clip scored higher.
 *
 * Call this for scenes where quality matters most (hook, climax).
 * Falls back to the successful result if one provider fails.
 */
export async function fusionRender(params: FusionParams): Promise<FusionResult> {
  const [runwayResult, klingResult] = await Promise.allSettled([
    generateRunwayClip({
      prompt:      params.prompt,
      imageUrl:    params.imageUrl,
      duration:    params.duration,
      aspectRatio: params.aspectRatio,
    }),
    generateKlingClip({
      prompt:          params.prompt,
      imageUrl:        params.imageUrl,
      duration:        params.duration,
      aspectRatio:     params.aspectRatio,
      negativePrompt:  params.klingParams?.negativePrompt,
      mode:            params.klingParams?.mode ?? 'pro',
      sceneNumber:     params.sceneIndex,
    }),
  ]);

  const successful: FusionResult[] = [];

  if (runwayResult.status === 'fulfilled') {
    const r = runwayResult.value;
    const s = scorer.scoreFromMetadata({ sceneIndex: params.sceneIndex, driftScore: 0, retries: 0, generationMs: r.generationMs, provider: 'runway' });
    successful.push({ videoUrl: r.videoUrl, provider: 'runway', score: s, generationMs: r.generationMs });
  }
  if (klingResult.status === 'fulfilled') {
    const k = klingResult.value;
    const s = scorer.scoreFromMetadata({ sceneIndex: params.sceneIndex, driftScore: 0, retries: 0, generationMs: k.generationMs ?? 0, provider: 'kling' });
    successful.push({ videoUrl: k.videoUrl, provider: 'kling', score: s, generationMs: k.generationMs ?? 0 });
  }

  if (successful.length === 0) throw new Error(`[FusionRenderer] Both providers failed for scene ${params.sceneIndex}`);

  return successful.reduce((best, cur) => scorer.bestOf(best.score, cur.score) === cur.score ? cur : best);
}
