/**
 * POST /api/generate-cinematic
 *
 * Quick-preview cinematic generation — wraps executeShot without a DB record.
 * Replaces the client-side Kling submit + polling pattern with a single
 * blocking server call that retries once on failure.
 *
 * Body:    { prompt: string; imageUrl?: string | null; duration?: number }
 * Returns: { clip_url: string }
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { executeShot } from "@/lib/shot-executor";
import { ok, fail } from "@/lib/api/response";
import type { ShotPacket } from "@/lib/types/shot";
import { getBrandProfile, getBrandSystemPrompt } from "@/lib/brand";
import { checkCache, saveCache, logUsageEvent } from "@/lib/cache";

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

  // Pre-flight: catch missing env var before hitting fal.ai
  if (!process.env.FAL_API_KEY) {
    console.error("[generate-cinematic] FAL_API_KEY is not set");
    return fail("FAL_API_KEY is not configured on the server", 500, "MISSING_ENV");
  }

  try {
    const body = await request.json() as { prompt?: string; imageUrl?: string | null; duration?: number };
    console.log("[generate-cinematic] RAW BODY", {
      hasPrompt: !!body.prompt,
      promptLength: body.prompt?.length ?? 0,
      imageUrl: body.imageUrl === null ? "null" : body.imageUrl === undefined ? "undefined" : body.imageUrl.substring(0, 80),
      duration: body.duration,
    });

    const { prompt, imageUrl = null } = body;
    const duration = typeof body.duration === 'number' ? body.duration : 8;

    if (typeof prompt !== 'string' || !prompt.trim()) {
      return fail("Missing required field: prompt", 400, "VALIDATION_ERROR");
    }

    let brandSuffix = "";
    try {
      const brand = await getBrandProfile(user.id);
      const ctx = getBrandSystemPrompt(brand);
      if (ctx && brand?.style_preset) brandSuffix = `, ${brand.style_preset} visual style`;
    } catch { /* brand injection is optional */ }

    const cacheInput = JSON.stringify({ prompt, imageUrl, duration });
    const cached = await checkCache(user.id, "generate-cinematic", cacheInput);
    if (cached) {
      try { return ok({ ...JSON.parse(cached), cached: true }); } catch { /* regenerate */ }
    }

    const visualPrompt = brandSuffix ? `${prompt.trim()}${brandSuffix}` : prompt.trim();

    const shot: ShotPacket = {
      shot_id:             crypto.randomUUID(),
      shot_number:         1,
      attention_function:  "pattern_interrupt",
      purpose_rationale:   "Quick cinematic preview",
      duration_seconds:    duration,
      energy_curve:        "spike",
      camera_behavior:     "slow_push_in",
      motion_intensity:    0.7,
      framing:             "medium",
      content_type:        "broll",
      visual_prompt:       visualPrompt,
      render_assignment:   "fal",
      fal_model:           "fal-ai/kling-video/v1.6/standard/image-to-video",
      transition_in:       "hard_cut",
      transition_after:    "cut",
      transition_duration: 0.3,
      audio_intent:        "background music",
      narration_text:      "",
      start_time:          0,
      end_time:            duration,
      fatigue_risk:        0.2,
      avatar_motion:       null,
      fal_render_params:   null,
      scene_image_url:     imageUrl,
    };

    const result = await executeShot(shot);

    if (!result) {
      return fail("Cinematic generation failed after retries. Please try again.", 500);
    }

    const payload = { clip_url: result.videoUrl };
    saveCache(user.id, "generate-cinematic", cacheInput, JSON.stringify(payload));
    logUsageEvent(user.id, "generate-cinematic", "generate", 8, { duration });
    return ok(payload);
   
  } catch (error: any) {
    console.error("[generate-cinematic] RAW ERROR:", error);
    console.error("[generate-cinematic] ERROR MESSAGE:", error?.message);
    console.error("[generate-cinematic] ERROR STACK:", error?.stack);
    return fail(error?.message || error?.toString() || "Unknown error", 500);
  }
}
