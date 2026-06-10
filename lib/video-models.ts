// ── Canonical fal.ai video model slugs ───────────────────────────────────────
// All video generation routes must import from here — no hardcoded strings elsewhere.

// ── Kling v3 (default — best motion quality, June 2026) ──────────────────────
export const KLING_I2V_PRO     = "fal-ai/kling-video/v3/pro/image-to-video";     // avatar animate, multi-char composite
export const KLING_T2V_PRO     = "fal-ai/kling-video/v3/pro/text-to-video";      // cinematic clips (parallel engine)
export const KLING_I2V_MODEL   = "fal-ai/kling-video/v3/standard/image-to-video"; // lower-cost i2v fallback
export const KLING_T2V_MODEL   = "fal-ai/kling-video/v3/standard/text-to-video";  // lower-cost t2v fallback

// ── Kling v2.1 (explicit fallback only — do not use as default) ──────────────
export const KLING_I2V_PRO_V2  = "fal-ai/kling-video/v2.1/pro/image-to-video";
export const KLING_T2V_PRO_V2  = "fal-ai/kling-video/v2.1/pro/text-to-video";

export const RUNWAY_MODEL      = "fal-ai/runway-gen4/turbo";

// Models that have been removed from fal.ai and must never be used.
const DEPRECATED_MODELS = [
  "fal-ai/fast-animatediff/turbo/text-to-video",
  "fal-ai/fast-svd-lcm",
  "fal-ai/kling-video/v1.6/standard/image-to-video",
  "fal-ai/kling-video/v1.6/standard/text-to-video",
  "fal-ai/kling-video/v1.6/pro/image-to-video",
  "fal-ai/kling-video/v1.6/pro/text-to-video",
  "fal-ai/hedra/character-1",   // replaced by direct Hedra API (lib/providers/hedra.ts)
  "fal-ai/sync-lipsync",        // replaced by Hedra
];

// Startup validation — called once at module load.
const ACTIVE_MODELS = [KLING_I2V_MODEL, KLING_T2V_MODEL, KLING_I2V_PRO, KLING_T2V_PRO, RUNWAY_MODEL];

for (const m of ACTIVE_MODELS) {
  if (DEPRECATED_MODELS.includes(m)) {
    console.error(`[video-models] FATAL: active model "${m}" is in the deprecated list — remove it immediately`);
    // Do not throw — this runs at module load in Next.js and would crash the build.
    // The error log will surface in Vercel function logs.
  }
}

console.log("[video-models] active models:", ACTIVE_MODELS.join(", "));

// ── Shared response URL extractor ─────────────────────────────────────────────
// fal.ai wraps results differently depending on the SDK version and model.
// Confirmed response shapes:
//   { data: { video: { url } } }   ← Kling v3/v2.1 via fal.subscribe()
//   { video: { url } }             ← some older models
//   { output: { video_url } }      ← Runway and others
// Use this function everywhere — never write inline r?.video?.url extraction.
export function extractVideoUrl(result: unknown): string | undefined {
  const r = result as Record<string, unknown> | null | undefined;
  return (
    (r?.data  as { video?: { url?: string } })?.video?.url ??
    (r?.video as { url?: string })?.url ??
    (r?.output as { video_url?: string })?.video_url ??
    undefined
  );
}
