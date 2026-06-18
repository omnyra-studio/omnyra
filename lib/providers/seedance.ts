/**
 * @deprecated fal.ai Seedance is disabled.
 * Use elevenLabsSeedanceGenerate() from @/lib/services/elevenlabs — fails hard if EL API unavailable.
 */

import { SEEDANCE_ELEVENLABS_MODEL } from "@/lib/services/elevenlabs";

export const SEEDANCE_T2V_MODEL = SEEDANCE_ELEVENLABS_MODEL;
export const SEEDANCE_I2V_MODEL = SEEDANCE_ELEVENLABS_MODEL;

export type SeedanceMotionStrength = "maximum" | "high" | "medium" | "low";

export interface SeedanceGenerateInput {
  prompt: string;
  duration?: number;
  motionStrength?: SeedanceMotionStrength;
  aspectRatio?: "9:16" | "16:9" | "1:1" | "auto";
  imageUrl?: string;
  generateAudio?: boolean;
  resolution?: "480p" | "720p" | "1080p";
  pollInterval?: number;
}

export interface SeedanceGenerateResult {
  url: string;
  model_used: string;
  generation_ms: number;
  seed?: number;
}

export async function callSeedance(_input: SeedanceGenerateInput): Promise<SeedanceGenerateResult> {
  throw new Error(
    "fal.ai Seedance fallback is disabled. Use elevenLabsSeedanceGenerate() — " +
    "ElevenLabs /v1/video/seedance/generate is not in the public API (returns 404).",
  );
}