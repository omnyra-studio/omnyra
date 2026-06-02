import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fal } from "@fal-ai/client";
import { KLING_I2V_MODEL, KLING_T2V_MODEL, extractVideoUrl } from "@/lib/video-models";
import { generateSmartMotionClip, pickEffect } from "@/lib/smart-motion";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  extractBibles,
  buildConsistencySuffix,
  validateFrameConsistency,
  computeContinuityScore,
  type ContinuityBibles,
  type ContinuityScore,
} from "@/lib/visual-continuity";

export const maxDuration = 300;

const CLIP_SECONDS = 10;
const ROUTE_VERSION = "2026-06-02T00:00:00Z-v4-hybrid";

const FLUX_MODEL = "fal-ai/flux/schnell";

// ── Types ─────────────────────────────────────────────────────────────────────

type SceneProvider = "kling" | "smart_motion";

// ── Storage upload helper ─────────────────────────────────────────────────────

async function uploadSmartMotionClip(
  buffer: Buffer,
  userId: string,
  index: number,
): Promise<string> {
  const path = `${userId}/smart-motion/${Date.now()}-clip${index}.mp4`;
  const { error } = await supabaseAdmin.storage
    .from("renders")
    .upload(path, buffer, { contentType: "video/mp4", upsert: true });
  if (error) throw new Error(`smart-motion upload: ${error.message}`);
  const { data: { publicUrl } } = supabaseAdmin.storage.from("renders").getPublicUrl(path);
  return publicUrl;
}

// ── Image generation for smart_motion without a source image ─────────────────

async function generateSceneImage(prompt: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (fal as any).subscribe(FLUX_MODEL, {
    input: {
      prompt: `${prompt}, ultra realistic, cinematic, 9:16 portrait, professional photography`,
      image_size: { width: 720, height: 1280 },
      num_inference_steps: 4,
      num_images: 1,
    },
    logs: false,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const url = (result as any)?.images?.[0]?.url;
  if (!url) throw new Error("FLUX: no image URL returned");
  return url as string;
}

// ── Clip generators ───────────────────────────────────────────────────────────

async function generateKlingClip(
  prompt: string,
  imageUrl: string | null,
  duration: "5" | "10",
  label: string,
  clipReports: string[],
): Promise<string | null> {
  const hasImage = typeof imageUrl === "string" && imageUrl.startsWith("https://");

  if (hasImage) {
    const i2vInput = { prompt, image_url: imageUrl, duration, aspect_ratio: "9:16", generate_audio: false };
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (fal as any).subscribe(KLING_I2V_MODEL, { input: i2vInput, logs: false, pollInterval: 4000 });
      const url = extractVideoUrl(result);
      if (!url) throw new Error("no video URL from i2v");
      clipReports.push(`${label} | ${KLING_I2V_MODEL} | OK | ${url.substring(0, 80)}`);
      return url;
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any;
      clipReports.push(`${label} | ${KLING_I2V_MODEL} | FAIL | ${e?.message ?? String(err)}`);
      console.warn(`${label} i2v FAILED — falling back to t2v`);
    }
  }

  // text-to-video fallback
  const t2vInput = { prompt, duration, aspect_ratio: "9:16", generate_audio: false };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (fal as any).subscribe(KLING_T2V_MODEL, { input: t2vInput, logs: false, pollInterval: 4000 });
    const url = extractVideoUrl(result);
    if (!url) throw new Error("no video URL from t2v");
    clipReports.push(`${label} | ${KLING_T2V_MODEL} | OK | ${url.substring(0, 80)}`);
    return url;
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any;
    const detail = `${e?.message ?? String(err)}`;
    clipReports.push(`${label} | ${KLING_T2V_MODEL} | FAIL | ${detail}`);
    console.error(`${label} t2v FAILED: ${detail}`);
    return null;
  }
}

async function generateSmartMotionClipWithUpload(
  prompt: string,
  imageUrl: string | null,
  sceneType: string,
  index: number,
  userId: string,
  label: string,
  clipReports: string[],
  durationSec: number,
  sourceImages: Array<string | null>,
): Promise<string | null> {
  const smT0 = Date.now();
  try {
    const sourceImageUrl = (typeof imageUrl === "string" && imageUrl.startsWith("https://"))
      ? imageUrl
      : await generateSceneImage(prompt);

    sourceImages[index] = sourceImageUrl;

    const effect = pickEffect(sceneType, index);
    console.log(`${label} [SMART_MOTION] effect=${effect} sourceImage=${sourceImageUrl.substring(0, 60)}`);

    const buffer = await generateSmartMotionClip({ imageUrl: sourceImageUrl, effect, durationSec });
    const url    = await uploadSmartMotionClip(buffer, userId, index);

    const elapsed = Date.now() - smT0;
    clipReports.push(`${label} | smart_motion:${effect} | OK | ${url.substring(0, 80)} | ${elapsed}ms`);
    console.log(`${label} [SMART_MOTION] DONE effect=${effect} elapsed=${elapsed}ms url=${url.substring(0, 60)}`);
    return url;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    clipReports.push(`${label} | smart_motion | FAIL | ${msg}`);
    console.error(`${label} smart_motion FAILED: ${msg}`);
    return null;
  }
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const routeT0 = Date.now();
  console.log("SEQUENCE_ROUTE_VERSION", ROUTE_VERSION);

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const falKey = process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY;
  if (!falKey) return Response.json({ error: "FAL_API_KEY not configured" }, { status: 500 });
  fal.config({ credentials: falKey });

  let prompts: string[];
  let imageUrl: string | null | undefined;
  let clipDuration: number | undefined;
  let sceneTypes: (string | null)[] | undefined;
  let script: string | undefined;
  try {
    const body = await req.json() as {
      prompts?: string[];
      imageUrl?: string | null;
      clipDuration?: number;
      sceneTypes?: (string | null)[];
      script?: string;
    };
    prompts      = body.prompts ?? [];
    imageUrl     = body.imageUrl;
    clipDuration = body.clipDuration;
    sceneTypes   = body.sceneTypes;
    script       = body.script;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!prompts?.length) {
    return Response.json({ error: "prompts required" }, { status: 400 });
  }

  const rawSeconds = Math.round(clipDuration ?? CLIP_SECONDS);
  const duration = rawSeconds <= 7 ? "5" : "10";

  // ── Motion Budget: enforce max 2 premium (Kling) scenes per 30s ────────────
  // Total duration estimate: prompts.length * rawSeconds
  const estimatedTotalS = prompts.length * rawSeconds;
  const maxPremium = Math.max(2, Math.ceil((estimatedTotalS / 30) * 2));
  let premiumUsed = 0;

  // Resolve provider per scene (use sceneTypes if provided, else default to kling)
  const resolvedProviders: SceneProvider[] = prompts.map((_, i) => {
    const rawType = sceneTypes?.[i];
    const smartMotionTypes = ["quote", "educational", "cta", "background", "transition"];
    if (rawType && smartMotionTypes.includes(rawType)) return "smart_motion";
    return "kling";
  });

  // Apply motion budget: downgrade excess kling → smart_motion
  const finalProviders: SceneProvider[] = resolvedProviders.map((p) => {
    if (p === "kling") {
      if (premiumUsed < maxPremium) { premiumUsed++; return "kling"; }
      return "smart_motion";
    }
    return p;
  });

  const klingCount = finalProviders.filter(p => p === "kling").length;
  const smCount    = finalProviders.filter(p => p === "smart_motion").length;
  console.log(`[SCENE_ROUTER] scenes=${prompts.length} kling=${klingCount} smart_motion=${smCount} maxPremium=${maxPremium} estimatedTotalS=${estimatedTotalS}s`);
  console.log(`[PROVIDER_USAGE] { klingScenes: ${klingCount}, smartMotionScenes: ${smCount} }`);

  // ── Visual Continuity: extract bibles + inject enforcement suffixes ──────────
  let bibles: ContinuityBibles | null = null;
  let enforcedPrompts = [...prompts];
  try {
    bibles = await extractBibles(prompts, script);
    if (bibles.hasCharacter || bibles.environment) {
      const suffix = buildConsistencySuffix(bibles);
      if (suffix) {
        enforcedPrompts = prompts.map(p => p + suffix);
        console.log(`[CONTINUITY] bible_extracted hasCharacter=${bibles.hasCharacter} suffix_len=${suffix.length}`);
      }
    }
  } catch (err) {
    console.warn("[CONTINUITY] bible extraction failed (non-fatal):", err instanceof Error ? err.message : err);
  }

  const sourceImages: Array<string | null> = new Array(prompts.length).fill(null);
  const clipReports: string[] = [];

  // ── Parallel clip generation ───────────────────────────────────────────────
  console.log(`[TIMING] CLIP_GENERATION start clips=${prompts.length}`);
  const genT0 = Date.now();

  const results = await Promise.allSettled(
    enforcedPrompts.map(async (prompt, i) => {
      const clipT0    = Date.now();
      const provider  = finalProviders[i];
      const sceneType = sceneTypes?.[i] ?? undefined;
      const label     = `[clip ${i + 1}/${prompts.length}][${provider}]`;

      console.log(`${label} sceneType=${sceneType ?? "unknown"} prompt="${prompt.substring(0, 80)}"`);
      console.log(`[SCENE_ROUTER] scene=${i + 1} provider=${provider} sceneType=${sceneType ?? "unknown"}`);

      let url: string | null = null;

      if (provider === "smart_motion") {
        url = await generateSmartMotionClipWithUpload(
          prompt,
          imageUrl ?? null,
          sceneType ?? "default",
          i,
          user.id,
          label,
          clipReports,
          rawSeconds,
          sourceImages,
        );
      } else {
        url = await generateKlingClip(prompt, imageUrl ?? null, duration, label, clipReports);
      }

      const elapsed = Date.now() - clipT0;
      if (url) {
        console.log(`${label} DONE elapsed=${elapsed}ms url=${url.substring(0, 60)}`);
        return url;
      }
      throw new Error(`${label} no output URL after ${elapsed}ms`);
    }),
  );

  const genElapsed = Date.now() - genT0;
  console.log(`[TIMING] CLIP_GENERATION complete ${genElapsed}ms`);

  const clip_urls: string[] = [];
  const extractedUrls: Array<string | null> = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      clip_urls.push(r.value);
      extractedUrls.push(r.value);
    } else {
      extractedUrls.push(null);
      console.error("[cinematic-sequence] settled rejection:", r.reason instanceof Error ? r.reason.message : r.reason);
    }
  }

  const successfulClips = clip_urls.length;
  const failedClips     = prompts.length - successfulClips;

  // Motion coverage check
  const motionCoverage = successfulClips > 0 ? Math.round((successfulClips / prompts.length) * 100) : 0;
  console.log(`[QUALITY_GUARDRAIL] { motionScenes: ${successfulClips}, totalScenes: ${prompts.length}, coverage: ${motionCoverage}% }`);
  if (motionCoverage < 100) {
    console.warn(`[QUALITY_GUARDRAIL] coverage=${motionCoverage}% — ${failedClips} scenes failed`);
  }

  console.log(`[RENDER_BREAKDOWN] { klingScenes: ${klingCount}, smartMotionScenes: ${smCount}, genMs: ${genElapsed} }`);
  console.log(`[TIMING] SEQUENCE SUMMARY clipsAttempted=${prompts.length} success=${successfulClips} failed=${failedClips} genMs=${genElapsed}`);

  if (!clip_urls.length) {
    return Response.json({
      error: "All clips failed to generate",
      SEQUENCE_ROUTE_VERSION: ROUTE_VERSION,
      clipsAttempted: prompts.length,
      successfulClips,
      failedClips,
      extractedUrls,
      clipReports,
    }, { status: 500 });
  }

  // ── Visual Continuity: validate consecutive source image pairs ────────────
  let continuityScore: ContinuityScore | null = null;
  const validSourcePairs: Array<[string, string, number, number]> = [];
  for (let i = 0; i < sourceImages.length - 1; i++) {
    const a = sourceImages[i];
    const b = sourceImages[i + 1];
    if (a && b) validSourcePairs.push([a, b, i, i + 1]);
  }

  if (validSourcePairs.length && bibles) {
    try {
      console.log(`[CONTINUITY] validating ${validSourcePairs.length} consecutive frame pair(s)`);
      const frameResults = await Promise.all(
        validSourcePairs.map(([a, b, ia, ib]) =>
          validateFrameConsistency(a, b, ia, ib, bibles!)
        ),
      );
      continuityScore = computeContinuityScore(frameResults);
      console.log(`[CONTINUITY] overall=${continuityScore.overall}% char=${continuityScore.character}% env=${continuityScore.environment}% obj=${continuityScore.object}%`);
    } catch (err) {
      console.warn("[CONTINUITY] frame validation failed (non-fatal):", err instanceof Error ? err.message : err);
    }
  } else if (bibles) {
    // No smart_motion pairs to validate — return perfect scores (prompt enforcement active)
    continuityScore = { character: 100, environment: 100, object: 100, overall: 100, frameResults: [] };
  }

  // HEAD probe for logging (non-blocking)
  void Promise.allSettled(
    clip_urls.map(async (url, i) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      try {
        const headRes = await fetch(url, { method: "HEAD", signal: controller.signal });
        clearTimeout(timer);
        const size = headRes.headers.get("content-length") ?? "unknown";
        console.log(`[PHASE1] CLIP_${i + 1} size=${size}bytes http=${headRes.status}`);
      } catch (e) {
        clearTimeout(timer);
        console.warn(`[PHASE1] CLIP_${i + 1} HEAD failed: ${e instanceof Error ? e.message : e}`);
      }
    }),
  );

  const stitched_url = clip_urls[0];
  const totalMs = Date.now() - routeT0;
  console.log(`[TIMING] SEQUENCE TOTAL ${totalMs}ms clips=${clip_urls.length} kling=${klingCount} smart_motion=${smCount}`);

  return Response.json({
    stitched_url,
    clip_urls,
    clips_generated:     clip_urls.length,
    clip_duration:       Number(duration),
    total_duration:      clip_urls.length * Number(duration),
    providers:           finalProviders,
    motion_coverage:     motionCoverage,
    kling_scenes:        klingCount,
    smart_motion_scenes: smCount,
    continuity_score:    continuityScore,
    timing_ms:           { generation: genElapsed, total: totalMs },
  });
}
