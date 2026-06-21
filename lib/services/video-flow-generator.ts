/**
 * Full video generator — Kling 2.6 Pro multi-shot + ElevenLabs voiceover.
 * ONE fal.ai call returns one ~10s clip. No stitching.
 */

import { generateKlingProMultiShot, buildKlingMultiShotPrompt } from "@/lib/providers/kling-pro";
import {
  elevenLabsVoiceover,
  generateAmbientSound,
} from "@/lib/services/elevenlabs";
import { cleanScriptForVoice } from "@/lib/utils/clean-script-for-voice";
import { mergeVideoVoiceAmbient } from "@/lib/utils/merge-video-voice-ambient";
import { splitPromptIntoClips } from "@/lib/seedance/split-prompt";

export { mergeVideoVoiceAmbient } from "@/lib/utils/merge-video-voice-ambient";

const DEFAULT_NUM_CLIPS  = 3;
const CLIP_DURATION_SECS = 10;
const DEFAULT_AMBIENT    = "cinematic ambient music, subtle atmospheric soundscape";

export const FLOW_DEFAULT_VOICE_ID = "4tRn1lSkEn13EVTuqb0g";
export const SEQUENCE_ROUTE_VERSION = "2026-06-21-v21-kling-pro-multishot";

export type FlowStyle = "dynamic" | "flashmob" | "story";

export interface GenerateCompleteVideoParams {
  userId:              string;
  userScript:          string;
  imageUrl?:           string;
  voiceId?:            string;
  ambientDescription?: string;
  numClips?:           number;
  subjectDescriptor?:  string;
}

export interface GenerateCompleteVideoResult {
  videoUrl:        string;
  clipCount:       number;
  durationSeconds: number;
  hasAudio:        boolean;
  hasAmbient:      boolean;
  cleanVoiceText:  string;
  clipUrls:        string[];
  model:           string;
}

/** @deprecated Use GenerateCompleteVideoParams */
export type GenerateFullVideoParams = GenerateCompleteVideoParams & {
  userPrompt?:    string;
  style?:         FlowStyle;
  voiceoverText?: string;
};

/** @deprecated Use GenerateCompleteVideoResult */
export type GenerateFullVideoResult = GenerateCompleteVideoResult;

export { cleanScriptForVoice };

/** @deprecated kept for compat — use buildAtlasPrompt instead */
export function createStrongFlowPrompts(): string[] {
  return buildAtlasPrompt("A person in a cinematic scene", "a person", 3);
}

/** @deprecated */
export function createSmartFlowPrompts(
  _mainPrompt?: string,
  numClips = DEFAULT_NUM_CLIPS,
  _style: FlowStyle = "dynamic",
): string[] {
  return createStrongFlowPrompts().slice(0, numClips);
}

/**
 * Build director-prose scene prompts.
 * Format: "[WHO does WHAT, HOW]. [Camera movement]. [Atmosphere/light/sound]."
 * Rules: no keyword lists, no abstract emotions, Ghost Test — physical actions only.
 */
export function buildAtlasPrompt(
  sceneDescription: string,
  subjectDescriptor = "a person",
  numClips = 3,
  era?: string,
): string[] {
  const segments   = splitPromptIntoClips(sceneDescription, numClips);
  const eraPrefix  = era ? `Period accurate ${era}. No modern equipment or technology. ` : "";

  return segments.map((segment, i) => {
    const cleanSegment = segment
      .replace(/\[.*?\]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const cameras = [
      "Camera slowly pushes in, shallow depth of field, smooth controlled movement.",
      "Camera holds steady on medium shot, slight natural sway, rack focus on face.",
      "Camera gently pulls back, revealing wider scene, soft dolly motion.",
    ];
    const camera = cameras[i % cameras.length];

    const atmospheres = [
      "Warm golden-hour light falls across the scene, natural ambient sound fills the air.",
      "Soft diffused daylight, quiet environmental sounds, cinematic stillness.",
      "Rich deep shadows with warm rim light, subtle atmospheric texture in the air.",
    ];
    const atmosphere = atmospheres[i % atmospheres.length];

    const prompt = `${eraPrefix}${subjectDescriptor} ${cleanSegment}. ${camera} ${atmosphere}`.trim();
    console.log(`[KLING_PROMPT] scene=${i + 1}: ${prompt.substring(0, 120)}`);
    return prompt;
  });
}

/**
 * Full pipeline: build director prose → ONE Kling 2.6 Pro multi-shot call
 * → ElevenLabs voiceover → audio merge.
 * No stitching — Kling returns a single ~10s clip with 3 embedded scenes.
 */
export async function generateCompleteVideo(
  params: GenerateCompleteVideoParams,
): Promise<GenerateCompleteVideoResult> {
  const {
    userId,
    userScript,
    imageUrl,
    voiceId            = FLOW_DEFAULT_VOICE_ID,
    ambientDescription = DEFAULT_AMBIENT,
    numClips           = DEFAULT_NUM_CLIPS,
    subjectDescriptor  = "a person",
  } = params;

  if (!userScript?.trim()) throw new Error("userScript is required");

  const cleanVoiceText = cleanScriptForVoice(userScript);
  const scenePrompts   = buildAtlasPrompt(userScript, subjectDescriptor, numClips);

  console.log(`[FLOW] provider=kling-2.6-pro-multishot scenes=${numClips} duration=${CLIP_DURATION_SECS}s`);

  // Voiceover fires in parallel with clip generation.
  const voiceoverPromise = elevenLabsVoiceover({
    text:    cleanVoiceText,
    voiceId,
    userId,
    modelId: "eleven_turbo_v2_5",
    voiceSettings: {
      stability:        0.8,
      similarity_boost: 0.9,
      style:            0.35,
    },
  });

  // Single Kling Pro call — all 3 scenes in one request.
  const klingResult = await generateKlingProMultiShot({
    scenePrompts,
    startImageUrl: imageUrl?.startsWith("https://") ? imageUrl : undefined,
    duration:      "10",
    aspectRatio:   "9:16",
  });

  const [voiceResult, ambientBuffer] = await Promise.all([
    voiceoverPromise,
    generateAmbientSound(ambientDescription, CLIP_DURATION_SECS).catch((err) => {
      console.warn("[FLOW] ambient generation failed — voice only:", err instanceof Error ? err.message : err);
      return null;
    }),
  ]);

  console.log(`[FLOW] Final merge — voice${ambientBuffer ? " + ambient" : ""}...`);

  const { videoUrl, durationSeconds } = await mergeVideoVoiceAmbient({
    clipUrls:      [klingResult.videoUrl],
    userId,
    voiceAudioUrl: voiceResult.audioUrl,
    ambientBuffer: ambientBuffer ?? undefined,
  });

  console.log(
    `[FLOW] Done — ${durationSeconds.toFixed(1)}s | kling=1 audio=true ambient=${!!ambientBuffer}`,
  );

  return {
    videoUrl,
    clipCount:       1,
    durationSeconds,
    hasAudio:        true,
    hasAmbient:      !!ambientBuffer,
    cleanVoiceText,
    clipUrls:        [klingResult.videoUrl],
    model:           "kling-2.6-pro",
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

/** Derive clip count (always 3 for Kling multi-shot). */
export function clipsForDuration(_durationSecs: number): number {
  return 3;
}
