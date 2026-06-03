import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getBrandProfile, getBrandSystemPrompt } from "@/lib/brand";
import { checkCache, saveCache, logUsageEvent } from "@/lib/cache";
import { CREDIT_COSTS } from "@/lib/rules/creditRules";
import { withCreditState, InsufficientCreditsError } from "@/lib/credits/withCreditState";

export const maxDuration = 60;

const QUALITY_PROMPTS: Record<string, string> = {
  product:   "professional product photography, studio lighting, clean background, sharp focus, commercial grade, 8K resolution",
  lifestyle: "lifestyle photography, natural lighting, authentic, candid, shallow depth of field, warm tones",
  thumbnail: "eye-catching thumbnail, bold colors, high contrast, dynamic composition, viral aesthetic",
  portrait:  "professional portrait, soft key light, bokeh background, teal and orange grade, film grain 0.08",
  ugc:       "authentic UGC style, handheld camera feel, natural lighting, real person, relatable aesthetic",
};

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { prompt?: string; niche?: string; style?: string; quality?: string; aspect_ratio?: string; num_images?: number; seed?: number };
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const {
    prompt,
    niche,
    style        = "lifestyle",
    quality      = "standard",
    aspect_ratio = "9:16",
    seed,
  } = body;
  const num_images = Math.min(Math.max(1, Number(body.num_images ?? 1)), 4);

  if (!prompt?.trim()) return Response.json({ error: "prompt required" }, { status: 400 });

  const falKey = process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY;
  if (!falKey) return Response.json({ error: "FAL_API_KEY not configured" }, { status: 503 });

  // ── Determine cost BEFORE any credit reservation ──────────────────────────────
  const creditAction = quality === "pro" ? "image_hd" : "image_standard";
  const creditCost   = CREDIT_COSTS[creditAction];

  // ── Brand context (best-effort, read-only — safe before credit reservation) ───
  let brandSuffix = "";
  try {
    const brand = await getBrandProfile(user.id);
    const ctx   = getBrandSystemPrompt(brand);
    if (ctx && brand?.style_preset) brandSuffix = `, ${brand.style_preset} visual style`;
    else if (ctx && brand?.niche)   brandSuffix = `, aligned with ${brand.niche} brand aesthetic`;
  } catch { /* brand injection is optional */ }

  // ── Cache check BEFORE credit reservation — no credits charged on cache hit ───
  const cacheInput = JSON.stringify({ prompt, niche, style, quality, aspect_ratio, num_images });
  const cached = await checkCache(user.id, "generate-image", cacheInput);
  if (cached) {
    try { return Response.json({ ...JSON.parse(cached), cached: true }); }
    catch { /* regenerate */ }
  }

  // ── Build FAL request ─────────────────────────────────────────────────────────
  const isAnimated      = ["Animation", "Motion Content"].includes(niche ?? "");
  const qualityPrompt   = QUALITY_PROMPTS[style] ?? QUALITY_PROMPTS.lifestyle;
  const animPrefix      = isAnimated ? "anime illustration style, 2D animated, vibrant cel-shaded colors, " : "";
  const enhancedPrompt  = `${animPrefix}${prompt.trim()}, ${qualityPrompt}${brandSuffix}`;

  const model = quality === "pro" ? "fal-ai/flux-pro" : "fal-ai/flux/schnell";

  let imageSize: { width: number; height: number };
  if (aspect_ratio === "9:16")      imageSize = { width: 1080, height: 1920 };
  else if (aspect_ratio === "16:9") imageSize = { width: 1920, height: 1080 };
  else                              imageSize = { width: 1080, height: 1080 };

  const requestBody = {
    prompt: enhancedPrompt,
    num_images,
    image_size: imageSize,
    ...(seed != null ? { seed } : {}),
    ...(quality === "pro"
      ? { safety_tolerance: "2" }
      : { num_inference_steps: 4, enable_safety_checker: true }
    ),
  };

  // ── Credit-protected generation ───────────────────────────────────────────────
  try {
    const result = await withCreditState<{ images: string[]; seed: number | null }>({
      userId: user.id,
      cost:   creditCost,
      run:    async () => {
        const res = await fetch(`https://fal.run/${model}`, {
          method:  "POST",
          headers: { Authorization: `Key ${falKey}`, "Content-Type": "application/json" },
          body:    JSON.stringify(requestBody),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error("[generate-image] fal error:", errText.substring(0, 300));
          throw new Error("Image generation failed");
        }

        const data   = await res.json() as { images?: { url: string }[]; seed?: number };
        const images = (data.images ?? []).map(img => img.url);
        return { data: { images, seed: data.seed ?? null } };
      },
    });

    saveCache(user.id, "generate-image", cacheInput, JSON.stringify(result));
    logUsageEvent(user.id, "generate-image", "generate", creditCost, { style, quality, niche, num_images });

    return Response.json(result);

  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return Response.json({
        error:    "INSUFFICIENT_CREDITS",
        balance:  err.balance,
        required: err.cost,
        planType: err.planType,
      }, { status: 402 });
    }
    console.error("[generate-image]", err instanceof Error ? err.message : err);
    return Response.json({ error: "Image generation failed" }, { status: 500 });
  }
}
