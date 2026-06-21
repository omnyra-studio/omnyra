// ── Canonical video model slugs ─────────────────────────────────────────────
// All video generation routes must import from here — no hardcoded strings elsewhere.

import { DEFAULT_VIDEO_MODEL } from "@/lib/video-provider";

// ── Kling 2.6 Pro via fal.ai — sole cinematic video provider ─────────────────
export const KLING_I2V_PRO_V26  = "fal-ai/kling-video/v2.6/pro/image-to-video";
export const KLING_T2V_PRO_V26  = "fal-ai/kling-video/v2.6/pro/text-to-video";

// Legacy slugs kept for type compatibility — all point to Kling 2.6 Pro
export const KLING_I2V_PRO      = KLING_I2V_PRO_V26;
export const KLING_T2V_PRO      = KLING_T2V_PRO_V26;
export const KLING_I2V_MODEL    = KLING_I2V_PRO_V26;
export const KLING_T2V_MODEL    = KLING_T2V_PRO_V26;
export const KLING_I2V_PRO_V2   = KLING_I2V_PRO_V26;
export const KLING_T2V_PRO_V2   = KLING_T2V_PRO_V26;

// Luma — REMOVED. Do not use.
export const LUMA_DREAM_MACHINE_T2V = "REMOVED";
export const LUMA_DREAM_MACHINE_I2V = "REMOVED";
export const LUMA_T2V_MODEL         = "REMOVED";
export const LUMA_I2V_MODEL         = "REMOVED";
// Seedance aliases — REMOVED. Do not use.
export const SEEDANCE_T2V_MODEL     = "REMOVED";
export const SEEDANCE_I2V_MODEL     = "REMOVED";

export const RUNWAY_MODEL      = "fal-ai/runway-gen4/turbo";

// Models that have been removed from fal.ai and must never be used.
const DEPRECATED_MODELS = [
  "fal-ai/fast-animatediff/turbo/text-to-video",
  "fal-ai/fast-svd-lcm",
  "fal-ai/kling-video/v1.6/standard/image-to-video",
  "fal-ai/kling-video/v1.6/standard/text-to-video",
  "fal-ai/kling-video/v1.6/pro/image-to-video",
  "fal-ai/kling-video/v1.6/pro/text-to-video",
  "fal-ai/hedra/character-1",
  "fal-ai/sync-lipsync",
  "fal-ai/luma-dream-machine/ray-2",
  "fal-ai/luma-dream-machine/ray-2/image-to-video",
  "bytedance/seedance-2.0/fast/image-to-video",
];

const ACTIVE_MODELS = [KLING_I2V_PRO_V26, KLING_T2V_PRO_V26];

for (const m of ACTIVE_MODELS) {
  if (DEPRECATED_MODELS.includes(m)) {
    console.error(`[video-models] FATAL: active model "${m}" is in the deprecated list — remove it immediately`);
  }
}

console.log(`[video-models] default=${DEFAULT_VIDEO_MODEL} active: kling-v2.6-pro, hedra`);

// ── Shared response URL extractor ─────────────────────────────────────────────
export function extractVideoUrl(result: unknown): string | undefined {
  const r = result as Record<string, unknown> | null | undefined;
  return (
    (r?.data  as { video?: { url?: string } })?.video?.url ??
    (r?.video as { url?: string })?.url ??
    (r?.output as { video_url?: string })?.video_url ??
    undefined
  );
}
