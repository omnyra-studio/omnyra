import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fal } from "@fal-ai/client";
import { KLING_I2V_MODEL, KLING_T2V_MODEL } from "@/lib/video-models";

export const maxDuration = 300;

const CLIP_SECONDS = 8;

export async function POST(req: Request) {
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

  const { prompts, imageUrl, clipDuration } = await req.json() as {
    prompts: string[];
    imageUrl?: string | null;
    clipDuration?: number;
  };

  if (!prompts?.length) {
    return Response.json({ error: "prompts required" }, { status: 400 });
  }

  const duration = String(Math.max(5, Math.min(10, Math.round(clipDuration ?? CLIP_SECONDS))));
  const hasImage = typeof imageUrl === "string" && imageUrl.startsWith("https://");

  console.log(`[generate-cinematic-sequence] clips=${prompts.length} duration=${duration} hasImage=${hasImage}`);

  const results = await Promise.allSettled(
    prompts.map(async (prompt, i) => {
      if (hasImage) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await (fal as any).subscribe(KLING_I2V_MODEL, {
            input: { prompt, image_url: imageUrl, duration, aspect_ratio: "9:16", generate_audio: false },
            logs: false,
            pollInterval: 5000,
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r = result as any;
          const url: string | undefined = r?.video?.url ?? r?.video_url ?? r?.url;
          if (!url) throw new Error(`clip ${i + 1}: no video URL from i2v`);
          return url;
        } catch (err) {
          console.warn(`[cinematic-sequence] i2v failed for clip ${i + 1}, falling back to t2v:`, err instanceof Error ? err.message : err);
        }
      }
      // text-to-video path (primary when no image, or i2v fallback)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (fal as any).subscribe(KLING_T2V_MODEL, {
        input: { prompt, duration, aspect_ratio: "9:16", generate_audio: false },
        logs: false,
        pollInterval: 5000,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = result as any;
      const url: string | undefined = r?.video?.url ?? r?.video_url ?? r?.url;
      if (!url) throw new Error(`clip ${i + 1}: no video URL from t2v`);
      return url;
    }),
  );

  const clip_urls: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      clip_urls.push(r.value);
    } else {
      console.error("[cinematic-sequence] clip failed:", r.reason);
    }
  }

  if (!clip_urls.length) {
    return Response.json({ error: "All clips failed to generate" }, { status: 500 });
  }

  let stitched_url = clip_urls[0];
  if (clip_urls.length > 1) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stitched = await (fal as any).subscribe("fal-ai/ffmpeg-api/concatenate", {
        input: { video_urls: clip_urls },
        logs: false,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = stitched as any;
      stitched_url = s?.video?.url ?? s?.url ?? s?.data?.video?.url ?? clip_urls[0];
    } catch (err) {
      console.error("[cinematic-sequence] stitch failed, returning first clip:", err instanceof Error ? err.message : err);
    }
  }

  return Response.json({
    stitched_url,
    clip_urls,
    clips_generated: clip_urls.length,
    total_duration: clip_urls.length * Number(duration),
  });
}
