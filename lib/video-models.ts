// ── Canonical fal.ai video model slugs ───────────────────────────────────────
// All video generation routes must import from here — no hardcoded strings elsewhere.

export const KLING_I2V_MODEL = "fal-ai/kling-video/v1.6/standard/image-to-video";
export const KLING_T2V_MODEL = "fal-ai/kling-video/v1.6/standard/text-to-video";
export const RUNWAY_MODEL    = "fal-ai/runway-gen4/turbo";

// Models that have been removed from fal.ai and must never be used.
const DEPRECATED_MODELS = [
  "fal-ai/fast-animatediff/turbo/text-to-video",
  "fal-ai/fast-svd-lcm",
  "fal-ai/kling-video/v1.6/pro/image-to-video",
  "fal-ai/kling-video/v1.6/pro/text-to-video",
  "fal-ai/kling-video/v3/pro/image-to-video",
];

// Startup validation — called once at module load.
const ACTIVE_MODELS = [KLING_I2V_MODEL, KLING_T2V_MODEL, RUNWAY_MODEL];

for (const m of ACTIVE_MODELS) {
  if (DEPRECATED_MODELS.includes(m)) {
    console.error(`[video-models] FATAL: active model "${m}" is in the deprecated list — remove it immediately`);
    // Do not throw — this runs at module load in Next.js and would crash the build.
    // The error log will surface in Vercel function logs.
  }
}

console.log("[video-models] active models:", ACTIVE_MODELS.join(", "));
