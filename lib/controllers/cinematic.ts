/**
 * Cinematic controller — FORCED Seedance via ElevenLabs only.
 * Express equivalent: controllers/cinematic.js
 */

import {
  elevenLabsSeedanceGenerate,
  elevenLabsVoiceover,
  mergeVideoAudio,
  DEFAULT_VOICE_ID,
  SEEDANCE_ELEVENLABS_MODEL,
} from "@/lib/services/elevenlabs";
import { uploadVideoToRenders } from "@/lib/storage/upload-cinematic-video";
import { saveRenderToLibrary } from "@/lib/renders/save-render";

export interface GenerateCinematicInput {
  userId: string;
  prompt: string;
  duration?: number;
  voiceoverText?: string;
  voiceId?: string;
  skipUpload?: boolean;
}

export interface GenerateCinematicSuccess {
  success: true;
  videoUrl: string;
  model: string;
  hasAudio: boolean;
  modelUsed?: string;
  hasMotion?: true;
  duration?: number;
}

export async function generateCinematic(
  input: GenerateCinematicInput,
): Promise<GenerateCinematicSuccess> {
  const {
    userId,
    prompt,
    duration = 30,
    voiceoverText,
    voiceId = DEFAULT_VOICE_ID,
    skipUpload,
  } = input;

  if (!prompt?.trim()) throw new Error("prompt is required");

  const trimmedPrompt = prompt.trim();
  const enhancedPrompt = `[ETHNICITY: Caucasian woman with blonde hair.]
${trimmedPrompt}

[MANDATORY STRONG MOTION: Camera push-in, zoom, natural walking, dancing movement, fluid body animation, dynamic energy. Make it alive and emotional.]`;

  try {
    console.log("✅ FORCING SEEDANCE VIA ELEVENLABS ONLY");

    const videoResult = await elevenLabsSeedanceGenerate({
      prompt:          enhancedPrompt,
      duration:        6,
      resolution:      "720p",
      motionIntensity: "high",
      rawPrompt:       true,
      generateAudio:   false,
    });

    if (!videoResult?.videoUrl) {
      throw new Error("Seedance returned no video");
    }

    let finalUrl = videoResult.videoUrl;

    if (voiceoverText?.trim()) {
      const audioResult = await elevenLabsVoiceover({
        text:    voiceoverText.trim(),
        voiceId,
        userId,
      });
      finalUrl = await mergeVideoAudio({
        videoUrl: videoResult.videoUrl,
        audioUrl: audioResult.audioUrl,
        userId,
      });
    }

    let publicUrl = finalUrl;
    const alreadyOnRenders =
      finalUrl.includes("/storage/v1/object/public/renders/") ||
      finalUrl.includes("/storage/v1/object/sign/renders/");
    if (!skipUpload && finalUrl.startsWith("http") && !alreadyOnRenders) {
      try {
        publicUrl = await uploadVideoToRenders(userId, finalUrl);
      } catch (uploadErr) {
        console.warn("[generateCinematic] upload failed, using source URL:", uploadErr);
      }
    }

    void saveRenderToLibrary({
      userId,
      videoUrl: publicUrl,
      script:   voiceoverText ?? prompt,
      template: "cinematic-seedance",
    }).catch(err => console.warn("[generateCinematic] library save failed:", err));

    return {
      success:  true,
      videoUrl: publicUrl,
      model:    SEEDANCE_ELEVENLABS_MODEL,
      hasAudio: !!voiceoverText?.trim(),
      modelUsed: SEEDANCE_ELEVENLABS_MODEL,
      hasMotion: true,
      duration,
    };
  } catch (error) {
    console.error("[SEEDANCE_ERROR]", error);
    throw error;
  }
}