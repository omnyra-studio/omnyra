import { routeToModel } from './modelRouter';
import { generateKlingVideo } from './realKling';

export async function generateVideoClip({
  prompt,
  selectedModel,
  referenceImages = [],
  duration        = 6,
  campaignMode    = false,
  microIntensity  = 65,
  activeEmotions  = [],
}: {
  prompt:           string;
  selectedModel:    string;
  referenceImages?: string[];
  duration?:        number;
  campaignMode?:    boolean;
  microIntensity?:  number;
  activeEmotions?:  string[];
}) {
  const modelRoute = await routeToModel({
    selectedModel,
    isAvatarHeavy: prompt.toLowerCase().includes('talking') || prompt.toLowerCase().includes('avatar'),
    campaignMode,
  });

  console.log(`[generateVideoClip] Routing to ${modelRoute.provider}`);

  if (modelRoute.provider === 'kling' && process.env.KLING_API_KEY) {
    const result = await generateKlingVideo({
      prompt,
      modelId:     modelRoute.model,
      duration,
      aspectRatio: '9:16',
      imageUrl:    referenceImages[0],
    });
    return {
      url:       result.url,
      thumbnail: result.url.replace(/\.mp4.*$/, '-thumb.jpg'),
      duration:  result.duration,
      modelUsed: modelRoute.model,
      provider:  modelRoute.provider,
    };
  }

  // Stub fallback while provider keys are not configured
  const videoUrl = `https://${modelRoute.provider}-generated-${Date.now()}.mp4`;
  return {
    url:       videoUrl,
    thumbnail: videoUrl.replace('.mp4', '-thumb.jpg'),
    duration,
    modelUsed: modelRoute.model,
    provider:  modelRoute.provider,
  };
}
