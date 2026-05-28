import { fal } from "@fal-ai/client";

export const maxDuration = 300;

const FAL_MODELS: Record<string, string> = {
  runway: "fal-ai/runway-gen4/turbo",
  kling:  "fal-ai/kling-video/v1.6/pro/text-to-video",
};

export async function POST(req: Request) {
  const { prompt, image_url, model = "fast", niche } = await req.json();

  const falKey = process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY;
  if (!falKey) {
    return Response.json({ error: "FAL_API_KEY not configured" }, { status: 500 });
  }

  fal.config({ credentials: falKey });

  const isAnimated = ['Animation', 'Motion Content'].includes(niche ?? '') ||
    prompt?.toLowerCase().includes('anime') ||
    prompt?.toLowerCase().includes('animated');

  const animationPrefix = isAnimated ? 'anime style, 2D animated, vibrant cel-shaded, ' : '';
  const cinemaPrompt = `${animationPrefix}${prompt}, cinematic motion, smooth natural movement, high quality`;

  if (model === "fast") {
    const hasImage = image_url && typeof image_url === 'string' && image_url.startsWith('https://');

    console.log('Video generation — image_url:', image_url?.substring(0, 80));
    console.log('Video generation — prompt:', prompt?.substring(0, 120));
    console.log('Video generation — hasImage:', hasImage);

    // Image provided → use Kling image-to-video (matches the selected scene)
    if (hasImage) {
      console.log('Using image-to-video with:', image_url.substring(0, 80));
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (fal as any).subscribe("fal-ai/kling-video/v1.6/pro/image-to-video", {
          input: {
            image_url,
            prompt: cinemaPrompt,
            duration: "3",
            aspect_ratio: "9:16",
            cfg_scale: 0.5,
          },
          onQueueUpdate: (update: unknown) => {
            console.log("Kling i2v status:", (update as { status?: string })?.status);
          },
        });

        console.log("Kling i2v result:", JSON.stringify(result).slice(0, 200));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = result as any;
        const videoUrl: string | undefined =
          r?.video?.url ?? r?.video_url ?? r?.url ?? r?.output?.[0];

        if (!videoUrl) throw new Error("Kling i2v returned no video URL");
        return Response.json({ video_url: videoUrl, status: "completed" });

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Kling i2v failed, falling back to text-to-video:", msg);
        // Fall through to minimax text-to-video below
      }
    }

    // No image or image-to-video failed → fast-animatediff text-to-video
    console.log('Using text-to-video (fast-animatediff)');
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (fal as any).subscribe("fal-ai/fast-animatediff/turbo/text-to-video", {
        input: {
          prompt: cinemaPrompt,
          num_frames: 16,
          num_inference_steps: 4,
          fps: 8,
          width: 512,
          height: 896,
        },
        onQueueUpdate: (update: unknown) => {
          console.log("fast-animatediff status:", (update as { status?: string })?.status);
        },
      });

      console.log("fast-animatediff result:", JSON.stringify(result).slice(0, 300));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = result as any;
      const videoUrl: string | undefined =
        r?.video?.url ?? r?.output?.[0] ?? r?.video_url ?? r?.url;

      if (!videoUrl) throw new Error("fast-animatediff returned no video URL");
      return Response.json({ video_url: videoUrl, status: "completed" });

    } catch (minimaxErr) {
      const minimaxMsg = minimaxErr instanceof Error ? minimaxErr.message : String(minimaxErr);
      console.log("fast-animatediff failed, trying svd-lcm fallback:", minimaxMsg);

      // Last resort: fast-svd-lcm
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fallback = await (fal as any).subscribe("fal-ai/fast-svd-lcm", {
          input: {
            ...(hasImage ? { image_url } : {}),
            motion_bucket_id: 127,
            cond_aug: 0.02,
            steps: 4,
          },
          onQueueUpdate: (update: unknown) => {
            console.log("svd-lcm status:", (update as { status?: string })?.status);
          },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const f = fallback as any;
        const fallbackUrl: string | undefined = f?.video?.url ?? f?.output?.[0] ?? f?.url;
        if (!fallbackUrl) throw new Error("svd-lcm returned no video URL");
        return Response.json({ video_url: fallbackUrl, status: "completed" });

      } catch (fallbackErr) {
        const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        console.error("all fast models failed:", { minimaxMsg, fallbackMsg });
        return Response.json({ error: `Video generation failed: ${minimaxMsg}` }, { status: 500 });
      }
    }
  }

  // Non-fast models (runway, kling text-to-video)
  const selectedModel = FAL_MODELS[model] ?? FAL_MODELS.runway;
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Generation timed out after 240s")), 240000)
  );

  try {
    console.log("fal.ai model used:", selectedModel);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await Promise.race([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fal as any).subscribe(selectedModel, {
        input: {
          prompt: cinemaPrompt,
          ...(image_url ? { image_url } : {}),
          num_frames: 97,
          frame_rate: 24,
          height: 480,
          width: 272,
          guidance_scale: 3,
          num_inference_steps: 30,
        },
        onQueueUpdate: (update: unknown) => {
          console.log("fal.ai update:", JSON.stringify(update));
        },
      }),
      timeout,
    ]);

    console.log("fal.ai result:", JSON.stringify(result).slice(0, 300));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = result as any;
    const videoUrl: string | undefined =
      r?.video?.url ?? r?.url ?? r?.output?.[0] ?? r?.data?.video?.url ??
      r?.output?.video?.url ?? r?.videos?.[0]?.url;

    if (!videoUrl) {
      console.error("fal.ai no video URL:", JSON.stringify(result).slice(0, 500));
      return Response.json({ error: "fal.ai returned no video URL" }, { status: 500 });
    }

    return Response.json({ video_url: videoUrl, status: "completed" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (err as any)?.body;
    console.error("fal.ai error:", msg, body ? JSON.stringify(body).slice(0, 400) : "");
    return Response.json({ error: msg }, { status: 500 });
  }
}
