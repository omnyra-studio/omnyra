/**
 * POST /api/generate-cinematic
 *
 * Quick-preview cinematic generation — Seedance via ElevenLabs only (no Kling).
 *
 * Body:    { prompt: string; duration?: number; voiceoverText?: string; voiceId?: string }
 * Returns: { success: true, videoUrl, modelUsed, hasMotion, hasAudio, duration }
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { generateCinematic } from "@/lib/controllers/cinematic";
import { ok, fail } from "@/lib/api/response";
import { getBrandProfile, getBrandSystemPrompt } from "@/lib/brand";
import { checkCache, saveCache, logUsageEvent } from "@/lib/cache";
import { parseJsonWithEthnicityFix } from "@/middleware/ethnicityFix";
import { DEFAULT_VOICE_ID } from "@/lib/services/elevenlabs";

export const maxDuration = 300;

export async function POST(request: Request) {
  console.log("=== GENERATE CINEMATIC ROUTE HIT ===");
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return fail("Unauthorized", 401);
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    console.error("[generate-cinematic] ELEVENLABS_API_KEY is not set");
    return fail("ELEVENLABS_API_KEY is not configured on the server", 500, "MISSING_ENV");
  }

  try {
    const body = await parseJsonWithEthnicityFix<{
      prompt?: string;
      duration?: number;
      voiceoverText?: string;
      voiceId?: string;
    }>(request);

    const { prompt, voiceoverText, voiceId = DEFAULT_VOICE_ID } = body;
    const duration = typeof body.duration === "number" ? body.duration : 30;

    if (typeof prompt !== "string" || !prompt.trim()) {
      return fail("Missing required field: prompt", 400, "VALIDATION_ERROR");
    }

    let visualPrompt = prompt.trim();
    try {
      const brand = await getBrandProfile(user.id);
      const ctx = getBrandSystemPrompt(brand);
      if (ctx && brand?.style_preset) visualPrompt = `${visualPrompt}, ${brand.style_preset} visual style`;
    } catch { /* brand injection is optional */ }

    const cacheInput = JSON.stringify({ prompt: visualPrompt, duration, voiceoverText });
    const cached = await checkCache(user.id, "generate-cinematic", cacheInput);
    if (cached) {
      try { return ok({ ...JSON.parse(cached), cached: true }); } catch { /* regenerate */ }
    }

    const result = await generateCinematic({
      userId:        user.id,
      prompt:        visualPrompt,
      duration,
      voiceoverText,
      voiceId,
    });

    const payload = {
      success:   result.success,
      videoUrl:  result.videoUrl,
      clip_url:  result.videoUrl,
      modelUsed: result.modelUsed,
      hasMotion: result.hasMotion,
      hasAudio:  result.hasAudio,
      duration:  result.duration,
    };

    saveCache(user.id, "generate-cinematic", cacheInput, JSON.stringify(payload));
    logUsageEvent(user.id, "generate-cinematic", "generate", 8, { duration });
    return ok(payload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[generate-cinematic] ERROR:", message);
    return fail(message || "Unknown error", 500);
  }
}