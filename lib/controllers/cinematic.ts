/**
 * Cinematic controller — Luma Ray 2 via fal.ai, TTS via ElevenLabs.
 * Express equivalent: controllers/cinematic.js
 */

import {
  elevenLabsSeedanceGenerate,
  elevenLabsVoiceover,
  mergeVideoAudio,
  DEFAULT_VOICE_ID,
  SEEDANCE_ELEVENLABS_MODEL,
} from "@/lib/services/elevenlabs";
import {
  generateCompleteVideo,
  clipsForDuration,
  FLOW_DEFAULT_VOICE_ID,
  type FlowStyle,
} from "@/lib/services/video-flow-generator";
import { uploadVideoToRenders } from "@/lib/storage/upload-cinematic-video";
import { saveRenderToLibrary } from "@/lib/renders/save-render";

export interface GenerateCinematicInput {
  userId: string;
  prompt: string;
  duration?: number;
  voiceoverText?: string;
  voiceId?: string;
  style?: FlowStyle;
  imageUrl?: string;
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
    voiceId = FLOW_DEFAULT_VOICE_ID,
    style = "dynamic",
    imageUrl,
    skipUpload,
  } = input;

  if (!prompt?.trim()) throw new Error("prompt is required");

  const trimmedPrompt = prompt.trim();
  const rawScript = voiceoverText?.trim() || trimmedPrompt;
  const numClips = clipsForDuration(duration);
  const useFlow = numClips > 1;

  try {
    if (useFlow) {
      console.log(`[FLOW] cinematic controller — generateCompleteVideo ${numClips}×6s style=${style}`);

      const flowResult = await generateCompleteVideo({
        userId,
        userScript:         rawScript,
        imageUrl,
        voiceId,
        numClips,
        ambientDescription: style === "flashmob"
          ? "upbeat inspirational flashmob music"
          : undefined,
      });

      void saveRenderToLibrary({
        userId,
        videoUrl: flowResult.videoUrl,
        script:   flowResult.cleanVoiceText,
        template: "cinematic-flow",
      }).catch(err => console.warn("[generateCinematic] library save failed:", err));

      return {
        success:   true,
        videoUrl:  flowResult.videoUrl,
        model:     flowResult.model,
        hasAudio:  flowResult.hasAudio,
        modelUsed: flowResult.model,
        hasMotion: true,
        duration:  flowResult.durationSeconds,
      };
    }

    const enhancedPrompt = `[ETHNICITY: Caucasian woman with blonde hair.]
${trimmedPrompt}

[MANDATORY STRONG MOTION: Camera push-in, zoom, natural walking, dancing movement, fluid body animation, dynamic energy. Make it alive and emotional.]`;

    console.log("[LUMA] cinematic controller — single 5s 720p");

    const videoResult = await elevenLabsSeedanceGenerate({
      prompt:          enhancedPrompt,
      duration:        5,
      resolution:      "720p",
      motionIntensity: "high",
      rawPrompt:       true,
      generateAudio:   false,
      imageUrl,
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