import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getBrandProfile, getBrandSystemPrompt } from "@/lib/brand";
import { checkCache, saveCache, logUsageEvent } from "@/lib/cache";
import { parseJsonWithEthnicityFix } from "@/middleware/ethnicityFix";
import { falLumaGenerate } from "@/lib/providers/luma";

export const maxDuration = 300;

export async function POST(req: Request) {
  const falKey = process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY;
  console.log("[generate-video-fal] === REQUEST START (Luma Ray 2 only) ===");

  if (!falKey) {
    return Response.json({ error: "FAL_API_KEY not configured" }, { status: 500 });
  }

  const { prompt, image_url, niche, duration } = await parseJsonWithEthnicityFix<{
    prompt: string;
    image_url?: string;
    niche?: string;
    duration?: number;
  }>(req);

  if (!prompt?.trim()) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

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

  const cacheInput = JSON.stringify({ prompt, image_url: !!image_url, niche });
  if (userId) {
    const cached = await checkCache(userId, "generate-video-fal", cacheInput);
    if (cached) {
      try { return Response.json({ ...JSON.parse(cached), cached: true }); } catch { /* regenerate */ }
    }
  }

  const isAnimated =
    ["Animation", "Motion Content"].includes(niche ?? "") ||
    prompt.toLowerCase().includes("anime") ||
    prompt.toLowerCase().includes("animated");

  const animationPrefix = isAnimated ? "anime style, 2D animated, vibrant cel-shaded, " : "";
  const cinemaPrompt = `${animationPrefix}${prompt}, cinematic motion, smooth natural movement, high quality${brandSuffix}`;

  try {
    const result = await falLumaGenerate({
      prompt:      cinemaPrompt,
      imageUrl:    image_url?.startsWith("https://") ? image_url : undefined,
      duration:    duration ?? 5,
      resolution:  "720p",
      aspectRatio: "9:16",
    });

    if (userId) {
      saveCache(userId, "generate-video-fal", cacheInput, JSON.stringify({ video_url: result.videoUrl, status: "completed" }));
      logUsageEvent(userId, "generate-video-fal", "generate", 8, { model: "luma-ray2" });
    }

    return Response.json({
      video_url:  result.videoUrl,
      status:     "completed",
      model:      result.modelUsed,
      duration:   result.duration,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-video-fal] LUMA FAILED:", msg);
    return Response.json(
      { error: `Luma Ray 2 via fal.ai failed: ${msg}` },
      { status: 500 },
    );
  }
}