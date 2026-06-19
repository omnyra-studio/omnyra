/**
 * Full video generator — visual clips + cleaned voiceover + ambient audio.
 * Express equivalent: services/full-video-generator.js
 */

import { generateVideoByProvider } from "@/lib/providers/video-dispatch";
import { SEEDANCE_FAL_FAST_MODEL } from "@/lib/providers/seedance";
import {
  elevenLabsVoiceover,
  generateAmbientSound,
} from "@/lib/services/elevenlabs";
import { cleanScriptForVoice } from "@/lib/utils/clean-script-for-voice";
import { mergeVideoVoiceAmbient } from "@/lib/utils/merge-video-voice-ambient";

export { mergeVideoVoiceAmbient } from "@/lib/utils/merge-video-voice-ambient";

const CLIP_SECONDS = 6;
const DEFAULT_NUM_CLIPS = 5;
const DEFAULT_AMBIENT = "upbeat inspirational flashmob music";

/** Default voice for flashmob / cinematic flow (ElevenLabs). */
export const FLOW_DEFAULT_VOICE_ID = "4tRn1lSkEn13EVTuqb0g";

export type FlowStyle = "dynamic" | "flashmob" | "story";

export interface GenerateCompleteVideoParams {
  userId: string;
  userScript: string;
  imageUrl?: string;
  voiceId?: string;
  ambientDescription?: string;
  numClips?: number;
}

export interface GenerateCompleteVideoResult {
  videoUrl: string;
  clipCount: number;
  durationSeconds: number;
  hasAudio: boolean;
  hasAmbient: boolean;
  cleanVoiceText: string;
  clipUrls: string[];
  model: string;
}

/** @deprecated Use GenerateCompleteVideoParams */
export type GenerateFullVideoParams = GenerateCompleteVideoParams & {
  userPrompt?: string;
  style?: FlowStyle;
  voiceoverText?: string;
};

/** @deprecated Use GenerateCompleteVideoResult */
export type GenerateFullVideoResult = GenerateCompleteVideoResult;

export { cleanScriptForVoice };

/** Strong Seedance prompts — flashmob narrative with explicit motion beats. */
export function createStrongFlowPrompts(): string[] {
  const base =
    "Photorealistic cinematic video, golden hour busy city street intersection, warm amber lighting, consistent handsome Caucasian businessman in dark suit and checkered shirt, realistic physics, detailed faces, emotional expressions, high detail, seamless motion continuation from previous clip. ";

  return [
    base +
      "Wide dynamic establishing shot: crowded intersection. Businessman walking forward seriously through the crowd. Natural pedestrian and traffic movement.",
    base +
      "Sudden energetic flashmob: dancers in bright red shirts emerge synchronized from the crowd and start powerful coordinated choreography around the businessman.",
    base +
      "Businessman reacts with surprise, eyes widen, turns to watch. Strong emotional shift on face. Dancers perform tight unison dance surrounding him. Crowd reacts with phones.",
    base +
      "High energy climax: full synchronized flashmob dance with dynamic spins, formations and powerful movements around the man. He stands amazed in the center.",
    base +
      "Flashmob smoothly disperses back into the crowd. Businessman stands still, transformed - face showing deep understanding and quiet smile. Traffic resumes around him.",
  ];
}

/** @deprecated Use createStrongFlowPrompts */
export function createSmartFlowPrompts(
  _mainPrompt?: string,
  numClips = DEFAULT_NUM_CLIPS,
  _style: FlowStyle = "dynamic",
): string[] {
  return createStrongFlowPrompts().slice(0, numClips);
}

/**
 * Full pipeline: clean script → 5×6s Seedance → voiceover → ambient → final merge.
 * Call with your full cinematic script as `userScript`.
 */
export async function generateCompleteVideo(
  params: GenerateCompleteVideoParams,
): Promise<GenerateCompleteVideoResult> {
  const {
    userId,
    userScript,
    imageUrl,
    voiceId = FLOW_DEFAULT_VOICE_ID,
    ambientDescription = DEFAULT_AMBIENT,
    numClips = DEFAULT_NUM_CLIPS,
  } = params;

  if (!userScript?.trim()) throw new Error("userScript is required");

  const cleanVoiceText = cleanScriptForVoice(userScript);
  const clipPrompts = createStrongFlowPrompts().slice(0, numClips);
  console.log(`Generating ${numClips} flowing ${CLIP_SECONDS}s Seedance clips...`);
  console.log(`[FLOW] voice: ${cleanVoiceText.substring(0, 80)}...`);

  const clipUrls: string[] = [];

  for (let i = 0; i < clipPrompts.length; i++) {
    const result = await generateVideoByProvider("seedance", {
      prompt:         clipPrompts[i],
      duration:       CLIP_SECONDS,
      resolution:     "720p",
      aspectRatio:    "9:16",
      imageUrl:       i === 0 && imageUrl?.startsWith("https://") ? imageUrl : undefined,
      motionStrength: "high",
      sceneNumber:    i + 1,
    });
    clipUrls.push(result.videoUrl);
    console.log(`Clip ${i + 1}/${numClips} completed`);
  }

  const [voiceResult, ambientBuffer] = await Promise.all([
    elevenLabsVoiceover({
      text: cleanVoiceText,
      voiceId,
      userId,
      modelId: "eleven_turbo_v2_5",
      voiceSettings: {
        stability:        0.8,
        similarity_boost: 0.9,
        style:            0.35,
      },
    }),
    generateAmbientSound(ambientDescription, numClips * CLIP_SECONDS).catch((err) => {
      console.warn("[FLOW] ambient generation failed — voice only:", err instanceof Error ? err.message : err);
      return null;
    }),
  ]);

  console.log(`[FLOW] Final merge — voice${ambientBuffer ? " + ambient" : ""}...`);

  const { videoUrl, durationSeconds } = await mergeVideoVoiceAmbient({
    clipUrls,
    userId,
    voiceAudioUrl: voiceResult.audioUrl,
    ambientBuffer: ambientBuffer ?? undefined,
  });

  console.log(
    `[FLOW] ✅ Done — ${durationSeconds.toFixed(1)}s | clips=${clipUrls.length} audio=true ambient=${!!ambientBuffer}`,
  );

  return {
    videoUrl,
    clipCount: clipUrls.length,
    durationSeconds,
    hasAudio: true,
    hasAmbient: !!ambientBuffer,
    cleanVoiceText,
    clipUrls,
    model: SEEDANCE_FAL_FAST_MODEL,
  };
}

/** @deprecated Alias — use generateCompleteVideo */
export async function generateFullVideo(
  params: GenerateFullVideoParams,
): Promise<GenerateCompleteVideoResult> {
  const script = params.userScript ?? params.userPrompt ?? params.voiceoverText ?? "";
  return generateCompleteVideo({
    userId:     params.userId,
    userScript: script,
    imageUrl:   params.imageUrl,
    voiceId:    params.voiceId,
    numClips:   params.numClips,
  });
}

/** Derive clip count from requested duration (6s per clip, max 5). */
export function clipsForDuration(durationSecs: number): number {
  return Math.min(5, Math.max(1, Math.round(durationSecs / CLIP_SECONDS)));
}