// Video generation worker — Seedance via ElevenLabs only (Kling + fal.ai disabled).

import { VISUAL_LOCK_CONSTRAINTS } from "@/lib/avatar/model-router";
import type { CharacterReference } from "@/lib/memory/types";
import { elevenLabsSeedanceGenerate, SEEDANCE_ELEVENLABS_MODEL } from "@/lib/services/elevenlabs";
import {
  applyMotionKeywords,
  buildMotionPrompt,
  HIGH_MOTION_STRENGTH,
} from "@/lib/motion-prompt";

export interface KlingWorkerInput {
  shotId:        string;
  shotNumber:    number;
  visualPrompt:  string;
  modelId?:      string;
  durationSecs?: number;
  aspectRatio?:  string;
  characterPromptSuffix?: string;
  brandSuffix?:  string;
  imageUrl?:     string;
  characterReferences?: CharacterReference[];
  speedMode?:    string;
  motionStrength?: number;
  isStylized?:   boolean;
  negativePrompt?: string;
}

export interface KlingWorkerResult {
  shotId:          string;
  shotNumber:      number;
  video_url:       string;
  duration_seconds: number;
  model_used:      string;
  generation_ms:   number;
}

function clampDuration(secs: number | undefined): number {
  if (!secs || secs <= 0) return 6;
  return Math.max(5, Math.min(10, Math.round(secs)));
}

export async function generateKlingClip(input: KlingWorkerInput): Promise<KlingWorkerResult> {
  const resolvedImageUrl: string | undefined =
    input.characterReferences?.length
      ? (input.characterReferences
          .filter(r => r.is_approved && r.image_url.startsWith("https://"))
          .sort((a, b) => b.quality_score - a.quality_score)[0]?.image_url
         ?? input.imageUrl)
      : input.imageUrl;

  if (resolvedImageUrl && resolvedImageUrl !== input.imageUrl) {
    console.info(`[SEEDANCE_REF_SELECT] shot=${input.shotId} using best approved reference`);
  }

  const isI2V = !!resolvedImageUrl;
  const duration = clampDuration(input.durationSecs);
  const rawAspect = input.aspectRatio ?? "9:16";
  const aspectRatio = (rawAspect === "auto" ? "9:16" : rawAspect) as "9:16" | "16:9" | "1:1";
  const ms = input.motionStrength ?? (input.isStylized ? 0.55 : HIGH_MOTION_STRENGTH);
  const motionStrength: "maximum" | "high" | "medium" | "low" =
    ms >= 0.65 ? "maximum" : ms >= 0.52 ? "high" : "medium";

  let motionModifier = "";
  if (input.isStylized) {
    motionModifier = ms >= 0.55
      ? "smooth fluid 3D CGI animation, characters with full body movement, expressive gestures, walking or acting with purpose, dynamic poses changing over time, lively animated scene, no static frames"
      : "gentle natural animation, subtle character movement and breathing, soft expressive animation";
  } else if (ms >= 0.68) {
    motionModifier = applyMotionKeywords("dynamic fluid motion, high energy movement, cinematic action, strong subject and camera motion, lively scene");
  } else if (ms <= 0.52) {
    motionModifier = "slow gentle movement, subtle realistic animation, natural micro-movements";
  } else {
    motionModifier = applyMotionKeywords("natural fluid animation, characters moving purposefully, smooth continuous motion");
  }

  let visualPromptFinal = buildMotionPrompt(input.visualPrompt);
  if (input.isStylized) {
    const hasAnimStyle = /\b(disney|pixar|animated|cartoon|3d animation|cgi)\b/i.test(input.visualPrompt);
    if (!hasAnimStyle) {
      visualPromptFinal =
        "Highly detailed 3D Disney Pixar style animation, vibrant colors, stylized cartoon characters, expressive faces, cinematic lighting, " +
        visualPromptFinal;
    }
  }

  const isCinematicAd = /\b(ad|commercial|pitch|office|mad men|dramatic office|sales pitch)\b/i.test(input.visualPrompt);
  if (isCinematicAd) {
    const hasDramatic = /\b(venetian|mad men|dramatic lighting|shadows|fist pump|passionately pitching)\b/i.test(visualPromptFinal);
    if (!hasDramatic) {
      visualPromptFinal = "Cinematic 1960s Mad Men dramatic office, intense venetian blind shadows, dramatic lighting, passionate middle-aged man in sharp suit, slicked hair, fist pump, intense expression, dynamic low angle to wide shot, film grain, professional color grading, high production value commercial ad, " + visualPromptFinal;
    }
  }

  const parts: string[] = [visualPromptFinal];
  if (motionModifier)              parts.push(motionModifier);
  if (input.characterPromptSuffix) parts.push(input.characterPromptSuffix);
  if (input.brandSuffix)           parts.push(input.brandSuffix);
  parts.push(VISUAL_LOCK_CONSTRAINTS.positive);

  const prompt = parts.filter(Boolean).join(", ");
  const modelId = input.modelId ?? SEEDANCE_ELEVENLABS_MODEL;

  console.info("[seedance-worker] submitting shot", {
    shot_id:    input.shotId,
    model:      modelId,
    mode:       isI2V ? "i2v" : "t2v",
    duration,
    speedMode:  input.speedMode ?? "balanced",
    motion:     motionStrength,
    prompt_preview: prompt.slice(0, 80),
  });

  console.log("✅ FORCING SEEDANCE VIA ELEVENLABS ONLY");
  const result = await elevenLabsSeedanceGenerate({
    prompt,
    duration:        duration || 6,
    resolution:      "720p",
    motionIntensity: "high",
    rawPrompt:       true,
    generateAudio:   false,
  });

  return {
    shotId:           input.shotId,
    shotNumber:       input.shotNumber,
    video_url:        result.videoUrl,
    duration_seconds: duration,
    model_used:       result.modelUsed,
    generation_ms:    result.generationMs,
  };
}