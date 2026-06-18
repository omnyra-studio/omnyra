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

  console.log(`[generateVideoClip] FORCING Seedance via ElevenLabs (was ${modelRoute.provider})`);

  const enhancedPrompt = buildSeedanceElevenLabsPrompt(prompt);
  console.log("✅ FORCING SEEDANCE VIA ELEVENLABS ONLY");
  const result = await elevenLabsSeedanceGenerate({
    prompt:          enhancedPrompt,
    duration:        6,
    resolution:      "720p",
    motionIntensity: "high",
    rawPrompt:       true,
    generateAudio:   false,
  });

  return {
    url:       result.videoUrl,
    thumbnail: result.videoUrl,
    duration,
    modelUsed: "seedance-elevenlabs",
    provider:  "seedance-elevenlabs",
  };
}