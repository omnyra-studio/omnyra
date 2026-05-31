import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fal } from "@fal-ai/client";
import { KLING_I2V_MODEL, KLING_T2V_MODEL, extractVideoUrl } from "@/lib/video-models";

export const maxDuration = 300;

const CLIP_SECONDS = 8;
const ROUTE_VERSION = "2026-05-30T00:00:00Z-v2";

export async function POST(req: Request) {
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

  const { prompts, imageUrl, clipDuration } = await req.json() as {
    prompts: string[];
    imageUrl?: string | null;
    clipDuration?: number;
  };

  if (!prompts?.length) {
    return Response.json({ error: "prompts required" }, { status: 400 });
  }

  // Kling v1.6 standard duration is an enum: "5" | "10" only.
  // Any other integer (e.g. "8") is rejected with a 422 validation error.
  const rawSeconds = Math.round(clipDuration ?? CLIP_SECONDS);
  const duration = rawSeconds <= 7 ? "5" : "10";
  const hasImage = typeof imageUrl === "string" && imageUrl.startsWith("https://");

  console.log("SEQUENCE_ROUTE_VERSION", ROUTE_VERSION);
  console.log("duration_input", clipDuration, "rawSeconds", rawSeconds, "duration_enum", duration);
  console.log(`[generate-cinematic-sequence] clips=${prompts.length} rawSeconds=${rawSeconds} duration=${duration} hasImage=${hasImage} imageUrlPrefix=${typeof imageUrl === "string" ? imageUrl.substring(0, 60) : imageUrl}`);

  const clipReports: string[] = [];

  const results = await Promise.allSettled(
    prompts.map(async (prompt, i) => {
      const label = `[clip ${i + 1}/${prompts.length}]`;
      console.log(`${label} prompt="${prompt.substring(0, 100)}" hasImage=${hasImage}`);

      if (hasImage) {
        const i2vInput = { prompt, image_url: imageUrl, duration, aspect_ratio: "9:16", generate_audio: false };
        console.log(`${label} → ${KLING_I2V_MODEL} payload=${JSON.stringify({ ...i2vInput, image_url: imageUrl!.substring(0, 60), prompt: prompt.substring(0, 80) })}`);
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await (fal as any).subscribe(KLING_I2V_MODEL, {
            input: i2vInput,
            logs: false,
            pollInterval: 5000,
          });
          const url = extractVideoUrl(result);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r = result as any;
          console.log(`${label} i2v raw result keys=${Object.keys(r ?? {}).join(",")} extractedUrl=${url}`);
          if (!url) {
            console.error(`${label} i2v URL extraction failed`, {
              responseKeys: Object.keys(r ?? {}),
              hasData: !!r?.data,
              hasVideo: !!r?.data?.video,
              rawResult: JSON.stringify(result).substring(0, 300),
            });
            const msg = `clip ${i + 1}: no video URL from i2v — result=${JSON.stringify(result).substring(0, 300)}`;
            clipReports.push(`Clip ${i + 1} | i2v | FAIL (no url) | ${msg}`);
            throw new Error(msg);
          }
          clipReports.push(`Clip ${i + 1} | ${KLING_I2V_MODEL} | OK | ${url.substring(0, 80)}`);
          console.log(`${label} i2v OK clip=${i + 1} extractedUrl=${url.substring(0, 80)}`);
          return url;
        } catch (err) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const e = err as any;
          const detail = `status=${e?.status ?? "?"} message=${e?.message ?? String(err)} body=${JSON.stringify(e?.body ?? null).substring(0, 300)}`;
          console.warn(`${label} i2v FAILED — ${detail} — falling back to t2v`);
          clipReports.push(`Clip ${i + 1} | ${KLING_I2V_MODEL} | FAIL | ${detail}`);
        }
      }

      // text-to-video path
      const t2vInput = { prompt, duration, aspect_ratio: "9:16", generate_audio: false };
      console.log(`${label} → ${KLING_T2V_MODEL} payload=${JSON.stringify({ ...t2vInput, prompt: prompt.substring(0, 80) })}`);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (fal as any).subscribe(KLING_T2V_MODEL, {
          input: t2vInput,
          logs: false,
          pollInterval: 5000,
        });
        const url = extractVideoUrl(result);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = result as any;
        console.log(`${label} t2v raw result keys=${Object.keys(r ?? {}).join(",")} extractedUrl=${url}`);
        if (!url) {
          console.error(`${label} t2v URL extraction failed`, {
            responseKeys: Object.keys(r ?? {}),
            hasData: !!r?.data,
            hasVideo: !!r?.data?.video,
            rawResult: JSON.stringify(result).substring(0, 300),
          });
          const msg = `clip ${i + 1}: no video URL from t2v — result=${JSON.stringify(result).substring(0, 300)}`;
          clipReports.push(`Clip ${i + 1} | t2v | FAIL (no url) | ${msg}`);
          throw new Error(msg);
        }
        clipReports.push(`Clip ${i + 1} | ${KLING_T2V_MODEL} | OK | ${url.substring(0, 80)}`);
        console.log(`${label} t2v OK clip=${i + 1} extractedUrl=${url.substring(0, 80)}`);
        return url;
      } catch (err) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = err as any;
        const detail = `status=${e?.status ?? "?"} message=${e?.message ?? String(err)} body=${JSON.stringify(e?.body ?? null).substring(0, 300)}`;
        console.error(`${label} t2v FAILED — ${detail}`);
        clipReports.push(`Clip ${i + 1} | ${KLING_T2V_MODEL} | FAIL | ${detail}`);
        throw new Error(detail);
      }
    }),
  );

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
  const failedClips = prompts.length - successfulClips;
  const clipsAttempted = prompts.length;

  console.log(`[cinematic-sequence] SUMMARY clipsAttempted=${clipsAttempted} successfulClips=${successfulClips} failedClips=${failedClips}`);
  console.log(`[cinematic-sequence] extractedUrls=${JSON.stringify(extractedUrls)}`);
  console.log(`[cinematic-sequence] clip_urls.length === 0: ${clip_urls.length === 0}`);

  if (!clip_urls.length) {
    const errorPayload = {
      error: "All clips failed to generate",
      SEQUENCE_ROUTE_VERSION,
      clipsAttempted,
      successfulClips,
      failedClips,
      extractedUrls,
      clipReports,
    };
    console.error("[cinematic-sequence] FATAL PAYLOAD", JSON.stringify(errorPayload, null, 2));
    return Response.json(errorPayload, { status: 500 });
  }

  // ── Stitch ────────────────────────────────────────────────────────────────────
  console.log(`[cinematic-sequence] STITCH clip_urls.length=${clip_urls.length} urls=${JSON.stringify(clip_urls.map(u => u.substring(0, 60)))}`);

  let stitched_url = clip_urls[0];
  let stitch_source = "clip_urls[0] (no stitch — only 1 clip)";

  if (clip_urls.length > 1) {
    console.log(`[cinematic-sequence] STITCH starting fal-ai/ffmpeg-api/concatenate with ${clip_urls.length} clips`);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stitched = await (fal as any).subscribe("fal-ai/ffmpeg-api/concatenate", {
        input: { video_urls: clip_urls },
        logs: false,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = stitched as any;
      console.log(`[cinematic-sequence] STITCH raw response keys=${Object.keys(s ?? {}).join(",")} full=${JSON.stringify(s).substring(0, 400)}`);

      const fromVideo    = s?.video?.url as string | undefined;
      const fromUrl      = s?.url as string | undefined;
      const fromDataVideo = (s?.data as { video?: { url?: string } })?.video?.url;
      const fromOutput   = (s?.output as { url?: string })?.url;

      console.log(`[cinematic-sequence] STITCH extraction: video.url=${fromVideo} url=${fromUrl} data.video.url=${fromDataVideo} output.url=${fromOutput}`);

      stitched_url = fromVideo ?? fromUrl ?? fromDataVideo ?? fromOutput ?? clip_urls[0];
      stitch_source = fromVideo    ? "s.video.url"      :
                      fromUrl      ? "s.url"             :
                      fromDataVideo ? "s.data.video.url" :
                      fromOutput   ? "s.output.url"      :
                      "FALLBACK clip_urls[0] (no url found in stitch response)";

      console.log(`[cinematic-sequence] STITCH result: source=${stitch_source} stitched_url=${stitched_url.substring(0, 80)}`);
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any;
      stitch_source = `FALLBACK clip_urls[0] (stitch THREW: status=${e?.status} message=${e?.message ?? String(err)})`;
      console.error(`[cinematic-sequence] STITCH FAILED — ${stitch_source}`);
    }
  }

  console.log(`[cinematic-sequence] FINAL stitched_url=${stitched_url.substring(0, 80)} source=${stitch_source}`);
  console.log(`[cinematic-sequence] is_stitched=${stitched_url !== clip_urls[0]} stitched_url_is_clip0=${stitched_url === clip_urls[0]}`);

  return Response.json({
    stitched_url,
    stitch_source,
    clip_urls,
    clips_generated: clip_urls.length,
    total_duration: clip_urls.length * Number(duration),
  });
}
