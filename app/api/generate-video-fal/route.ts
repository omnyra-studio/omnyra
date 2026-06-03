import { fal } from "@fal-ai/client";
import { KLING_I2V_MODEL, KLING_T2V_MODEL, RUNWAY_MODEL, extractVideoUrl } from "@/lib/video-models";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getBrandProfile, getBrandSystemPrompt } from "@/lib/brand";
import { checkCache, saveCache, logUsageEvent } from "@/lib/cache";

export const maxDuration = 300;

// Named model map for non-fast (explicit model) requests
const FAL_MODELS: Record<string, string> = {
  runway: RUNWAY_MODEL,
  kling:  KLING_T2V_MODEL,
};

function falError(model: string, status: number | undefined, msg: string, body: unknown): Response {
  const detail = body ? JSON.stringify(body).slice(0, 400) : msg;
  return Response.json(
    { error: `Provider: fal.ai | Model: ${model} | Status: ${status ?? "unknown"} | Message: ${detail}` },
    { status: 500 },
  );
}

export async function POST(req: Request) {
  const falKey = process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY;
  console.log('[generate-video-fal] === REQUEST START ===');
  console.log('[generate-video-fal] FAL_API_KEY present:', !!process.env.FAL_API_KEY, '| FALAI_API_KEY present:', !!process.env.FALAI_API_KEY);
  console.log('[generate-video-fal] key length:', falKey?.length ?? 0, '| last4:', falKey ? falKey.slice(-4) : 'none');

  const { prompt, image_url, model = "fast", niche } = await req.json();
  console.log('[generate-video-fal] payload:', { model, prompt: prompt?.substring(0, 80), has_image: !!image_url, niche });

  if (!falKey) {
    return Response.json({ error: "FAL_API_KEY not configured" }, { status: 500 });
  }

  fal.config({ credentials: falKey });

  // Optional auth — brand/cache only when user is available
  let userId: string | null = null;
  let brandSuffix = "";
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      const brand = await getBrandProfile(userId);
      const ctx = getBrandSystemPrompt(brand);
      if (ctx && brand?.style_preset) brandSuffix = `, ${brand.style_preset} visual style`;
    }
  } catch { /* brand injection is optional */ }

  const cacheInput = JSON.stringify({ prompt, image_url: !!image_url, model, niche });
  if (userId) {
    const cached = await checkCache(userId, "generate-video-fal", cacheInput);
    if (cached) {
      try { return Response.json({ ...JSON.parse(cached), cached: true }); } catch { /* regenerate */ }
    }
  }

  const isAnimated = ['Animation', 'Motion Content'].includes(niche ?? '') ||
    prompt?.toLowerCase().includes('anime') ||
    prompt?.toLowerCase().includes('animated');

  const animationPrefix = isAnimated ? 'anime style, 2D animated, vibrant cel-shaded, ' : '';
  const cinemaPrompt = `${animationPrefix}${prompt}, cinematic motion, smooth natural movement, high quality${brandSuffix}`;

  if (model === "fast") {
    const hasImage = image_url && typeof image_url === 'string' && image_url.startsWith('https://');
    console.log('[generate-video-fal] hasImage:', hasImage, '| image_url prefix:', image_url?.substring(0, 60));

    if (hasImage) {
      // Path A: image-to-video
      const activeModel = KLING_I2V_MODEL;
      console.log('[generate-video-fal] model=', activeModel);
      try {
         
        const result = await (fal as any).subscribe(activeModel, {
          input: { image_url, prompt: cinemaPrompt, duration: "5", aspect_ratio: "9:16" },
          onQueueUpdate: (u: unknown) => console.log('[generate-video-fal] i2v status:', (u as { status?: string })?.status),
        });
        console.log('[generate-video-fal] i2v result:', JSON.stringify(result).slice(0, 200));
         
        const videoUrl = extractVideoUrl(result);
        if (!videoUrl) throw new Error(`${activeModel} returned no video URL`);
        if (userId) { saveCache(userId, "generate-video-fal", cacheInput, JSON.stringify({ video_url: videoUrl, status: "completed" })); logUsageEvent(userId, "generate-video-fal", "generate", 8, { model: "i2v" }); }
        return Response.json({ video_url: videoUrl, status: "completed" });
      } catch (err) {
         
        const e = err as any;
        console.error('[generate-video-fal] i2v FAILED — model:', activeModel, '| status:', e?.status, '| msg:', e?.message, '| body:', JSON.stringify(e?.body ?? null));
        // Fall through to text-to-video
      }
    }

    // Path B: text-to-video (primary or i2v fallback)
    const activeModel = KLING_T2V_MODEL;
    console.log('[generate-video-fal] model=', activeModel);
    try {
       
      const result = await (fal as any).subscribe(activeModel, {
        input: { prompt: cinemaPrompt, duration: "5", aspect_ratio: "9:16" },
        onQueueUpdate: (u: unknown) => console.log('[generate-video-fal] t2v status:', (u as { status?: string })?.status),
      });
      console.log('[generate-video-fal] t2v result:', JSON.stringify(result).slice(0, 300));
       
      const videoUrl = extractVideoUrl(result);
      if (!videoUrl) throw new Error(`${activeModel} returned no video URL`);
      if (userId) { saveCache(userId, "generate-video-fal", cacheInput, JSON.stringify({ video_url: videoUrl, status: "completed" })); logUsageEvent(userId, "generate-video-fal", "generate", 8, { model: "t2v" }); }
      return Response.json({ video_url: videoUrl, status: "completed" });
    } catch (err) {
       
      const e = err as any;
      console.error('[generate-video-fal] t2v FAILED — model:', activeModel, '| status:', e?.status, '| msg:', e?.message, '| body:', JSON.stringify(e?.body ?? null));
      return falError(activeModel, e?.status, e?.message ?? String(err), e?.body);
    }
  }

  // Non-fast: explicit model selection (runway / kling)
  const selectedModel = FAL_MODELS[model] ?? FAL_MODELS.runway;
  console.log('[generate-video-fal] explicit model=', selectedModel);

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Generation timed out after 240s")), 240_000)
  );

  try {
     
    const result = await Promise.race([
       
      (fal as any).subscribe(selectedModel, {
        input: {
          prompt: cinemaPrompt,
          ...(image_url ? { image_url } : {}),
          duration: "5",
          aspect_ratio: "9:16",
        },
        onQueueUpdate: (u: unknown) => console.log('[generate-video-fal] explicit model status:', JSON.stringify(u)),
      }),
      timeout,
    ]);

    console.log('[generate-video-fal] explicit model result:', JSON.stringify(result).slice(0, 300));
     
    const r = result as any;
    const videoUrl: string | undefined =
      r?.video?.url ?? r?.url ?? r?.output?.[0] ?? r?.data?.video?.url ??
      r?.output?.video?.url ?? r?.videos?.[0]?.url;

    if (!videoUrl) {
      console.error('[generate-video-fal] no video URL in result:', JSON.stringify(result).slice(0, 500));
      return falError(selectedModel, undefined, "no video URL in response", result);
    }

    if (userId) { saveCache(userId, "generate-video-fal", cacheInput, JSON.stringify({ video_url: videoUrl, status: "completed" })); logUsageEvent(userId, "generate-video-fal", "generate", 10, { model }); }
    return Response.json({ video_url: videoUrl, status: "completed" });
  } catch (err) {
     
    const e = err as any;
    console.error('[generate-video-fal] explicit model FAILED — model:', selectedModel, '| status:', e?.status, '| msg:', e?.message);
    return falError(selectedModel, e?.status, e?.message ?? String(err), e?.body);
  }
}
