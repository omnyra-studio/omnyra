import { routeToModel } from "./modelRouter";
import { elevenLabsSeedanceGenerate } from "@/lib/services/elevenlabs";
import { buildSeedanceElevenLabsPrompt } from "@/lib/motion-prompt";

export async function generateVideoClip({
  prompt,
  selectedModel,
  referenceImages = [],
  duration        = 30,
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
  void campaignMode;
  void microIntensity;
  void activeEmotions;

  const modelRoute = await routeToModel({ selectedModel, campaignMode: true });

  console.log(`[generateVideoClip] Seedance via fal.ai (route=${modelRoute.provider})`);

  const enhancedPrompt = buildSeedanceElevenLabsPrompt(prompt);
  const result = await elevenLabsSeedanceGenerate({
    prompt:        enhancedPrompt,
    duration:      6,
    resolution:    "720p",
    rawPrompt:     true,
    generateAudio: false,
    imageUrl:      referenceImages[0],
    aspectRatio:   "9:16",
  });

  return {
    url:       result.videoUrl,
    thumbnail: result.videoUrl,
    duration,
    modelUsed: result.modelUsed,
    provider:  "seedance-fal",
  };
}