import { fal } from "@fal-ai/client";
import { KLING_I2V_MODEL } from "@/lib/video-models";

export const maxDuration = 300;

export async function POST(req: Request) {
  const { prompts, image_urls, clip_length, model } = await req.json();

  const falKey = process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY;
  if (!falKey) {
    return Response.json({ error: "FAL_API_KEY not configured" }, { status: 500 });
  }
  fal.config({ credentials: falKey });

  if (!prompts?.length) {
    return Response.json({ error: "prompts required" }, { status: 400 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clipPromises = prompts.map(async (prompt: string, i: number) => {
      const image_url = image_urls?.[i] ?? image_urls?.[0];

      if (model === "fast") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (fal as any).subscribe("fal-ai/ltx-video", {
          input: {
            prompt: `${prompt}, cinematic quality, smooth motion`,
            num_frames: 97,
            frame_rate: 24,
            height: 480,
            width: 272,
            guidance_scale: 3,
            num_inference_steps: 30,
          },
        });
        return result?.video?.url ?? result?.url ?? result?.data?.video?.url ?? null;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (fal as any).subscribe(
          KLING_I2V_MODEL,
          {
            input: {
              image_url,
              prompt: `${prompt}, cinematic motion, smooth movement`,
              duration: "5",
              aspect_ratio: "9:16",
            },
          }
        );
        return result?.video?.url ?? result?.url ?? result?.data?.video?.url ?? null;
      }
    });

    const clipUrls = (await Promise.all(clipPromises)).filter(Boolean) as string[];

    if (!clipUrls.length) {
      return Response.json({ error: "No clips generated" }, { status: 500 });
    }

    if (clipUrls.length === 1) {
      return Response.json({ video_url: clipUrls[0], clips: clipUrls });
    }

    // Stitch multiple clips via fal.ai concatenate
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stitched = await (fal as any).subscribe("fal-ai/ffmpeg-api/concatenate", {
      input: { video_urls: clipUrls },
    });

    const final_url =
      stitched?.video?.url ??
      stitched?.url ??
      stitched?.data?.video?.url ??
      clipUrls[0];

    return Response.json({ video_url: final_url, clips: clipUrls });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-video-sequence] error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
