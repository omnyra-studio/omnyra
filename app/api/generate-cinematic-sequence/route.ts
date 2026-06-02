import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fal } from "@fal-ai/client";
import { KLING_I2V_MODEL, KLING_T2V_MODEL, extractVideoUrl } from "@/lib/video-models";

export const maxDuration = 300;

// Kling v1.6 standard: only "5" | "10" accepted. Anything else → 422.
// We always request "10" for maximum scene duration. 3 clips = 30s scene.
const CLIP_SECONDS = 10;
const ROUTE_VERSION = "2026-05-31T00:00:00Z-v3";

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
  try {
    const body = await req.json() as { prompts?: string[]; imageUrl?: string | null; clipDuration?: number };
    prompts = body.prompts ?? [];
    imageUrl = body.imageUrl;
    clipDuration = body.clipDuration;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!prompts?.length) {
    return Response.json({ error: "prompts required" }, { status: 400 });
  }

  // Always request "10" — Kling v1.6 standard enum is "5" | "10" only.
  // Input of 10 → always maps to "10". Guarantees 10s per clip.
  const rawSeconds = Math.round(clipDuration ?? CLIP_SECONDS);
  const duration = rawSeconds <= 7 ? "5" : "10";
  const hasImage = typeof imageUrl === "string" && imageUrl.startsWith("https://");

  console.log(`[TIMING] SEQUENCE start clips=${prompts.length} duration_enum=${duration} hasImage=${hasImage}`);
  console.log(`[cinematic-sequence] clipDuration_in=${clipDuration} rawSeconds=${rawSeconds} duration_enum=${duration} imageUrlPrefix=${typeof imageUrl === "string" ? imageUrl.substring(0, 60) : imageUrl}`);

  const clipReports: string[] = [];

  // ── Parallel clip generation ────────────────────────────────────────────────
  console.log(`[TIMING] CLIP_GENERATION start clips=${prompts.length}`);
  const genT0 = Date.now();

  const results = await Promise.allSettled(
    prompts.map(async (prompt, i) => {
      const clipT0 = Date.now();
      const label = `[clip ${i + 1}/${prompts.length}]`;
      console.log(`${label} prompt="${prompt.substring(0, 100)}" hasImage=${hasImage}`);

      if (hasImage) {
        const i2vInput = { prompt, image_url: imageUrl, duration, aspect_ratio: "9:16", generate_audio: false };
        console.log(`[TIMING] CLIP_${i+1} i2v start`);
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await (fal as any).subscribe(KLING_I2V_MODEL, {
            input: i2vInput,
            logs: false,
            pollInterval: 4000,
          });
          const url = extractVideoUrl(result);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r = result as any;
          console.log(`[TIMING] CLIP_${i+1} i2v complete ${Date.now() - clipT0}ms url=${url?.substring(0,60)}`);
          if (!url) {
            const msg = `clip ${i + 1}: no video URL from i2v — result=${JSON.stringify(result).substring(0, 300)}`;
            clipReports.push(`Clip ${i + 1} | i2v | FAIL (no url) | ${msg}`);
            throw new Error(msg);
          }
          clipReports.push(`Clip ${i + 1} | ${KLING_I2V_MODEL} | OK | ${url.substring(0, 80)}`);
          console.log(`${label} i2v OK extractedUrl=${url.substring(0, 80)} elapsed=${Date.now() - clipT0}ms`);
          void r; // suppress unused warning
          return url;
        } catch (err) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const e = err as any;
          const detail = `status=${e?.status ?? "?"} message=${e?.message ?? String(err)} body=${JSON.stringify(e?.body ?? null).substring(0, 300)}`;
          console.warn(`[TIMING] CLIP_${i+1} i2v FAILED ${Date.now() - clipT0}ms — ${detail} — falling back to t2v`);
          clipReports.push(`Clip ${i + 1} | ${KLING_I2V_MODEL} | FAIL | ${detail}`);
        }
      }

      // ── text-to-video path ──────────────────────────────────────────────────
      const t2vInput = { prompt, duration, aspect_ratio: "9:16", generate_audio: false };
      console.log(`[TIMING] CLIP_${i+1} t2v start`);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (fal as any).subscribe(KLING_T2V_MODEL, {
          input: t2vInput,
          logs: false,
          pollInterval: 4000,
        });
        const url = extractVideoUrl(result);
        console.log(`[TIMING] CLIP_${i+1} t2v complete ${Date.now() - clipT0}ms url=${url?.substring(0,60)}`);
        if (!url) {
          const msg = `clip ${i + 1}: no video URL from t2v — result=${JSON.stringify(result).substring(0, 300)}`;
          clipReports.push(`Clip ${i + 1} | t2v | FAIL (no url) | ${msg}`);
          throw new Error(msg);
        }
        clipReports.push(`Clip ${i + 1} | ${KLING_T2V_MODEL} | OK | ${url.substring(0, 80)}`);
        console.log(`${label} t2v OK extractedUrl=${url.substring(0, 80)} elapsed=${Date.now() - clipT0}ms`);
        return url;
      } catch (err) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = err as any;
        const detail = `status=${e?.status ?? "?"} message=${e?.message ?? String(err)} body=${JSON.stringify(e?.body ?? null).substring(0, 300)}`;
        console.error(`[TIMING] CLIP_${i+1} t2v FAILED ${Date.now() - clipT0}ms — ${detail}`);
        clipReports.push(`Clip ${i + 1} | ${KLING_T2V_MODEL} | FAIL | ${detail}`);
        throw new Error(detail);
      }
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
  const failedClips = prompts.length - successfulClips;

  console.log(`[TIMING] SEQUENCE SUMMARY clipsAttempted=${prompts.length} success=${successfulClips} failed=${failedClips} genMs=${genElapsed}`);

  if (!clip_urls.length) {
    const errorPayload = {
      error: "All clips failed to generate",
      SEQUENCE_ROUTE_VERSION: ROUTE_VERSION,
      clipsAttempted: prompts.length,
      successfulClips,
      failedClips,
      extractedUrls,
      clipReports,
    };
    console.error("[cinematic-sequence] FATAL PAYLOAD", JSON.stringify(errorPayload, null, 2));
    return Response.json(errorPayload, { status: 500 });
  }

  // ── PHASE 1: HEAD-probe each clip URL for duration + size ──────────────────
  console.log(`[TIMING] HEAD_PROBE start clips=${clip_urls.length}`);
  const probeT0 = Date.now();
  await Promise.allSettled(
    clip_urls.map(async (url, i) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      try {
        const headRes = await fetch(url, { method: "HEAD", signal: controller.signal });
        clearTimeout(timer);
        const size = headRes.headers.get("content-length") ?? "unknown";
        const ct   = headRes.headers.get("content-type") ?? "unknown";
        console.log(`[PHASE1] CLIP_${i + 1} duration_enum=${duration}s size=${size}bytes ct=${ct} http=${headRes.status}`);
      } catch (e) {
        clearTimeout(timer);
        const reason = e instanceof Error && e.name === "AbortError" ? "timeout" : (e instanceof Error ? e.message : e);
        console.warn(`[PHASE1] CLIP_${i + 1} HEAD failed: ${reason}`);
      }
    }),
  );
  console.log(`[TIMING] HEAD_PROBE complete ${Date.now() - probeT0}ms`);

  // stitched_url is the FIRST clip only — it is NOT concatenated.
  // Callers must use clip_urls[] + compose-video to assemble the full video.
  const stitched_url = clip_urls[0];
  const totalMs = Date.now() - routeT0;
  console.log(`[TIMING] SEQUENCE TOTAL ${totalMs}ms clips=${clip_urls.length} first_clip=${stitched_url.substring(0, 80)}`);

  return Response.json({
    stitched_url,           // first clip only — NOT the full concatenated video
    clip_urls,              // all N clips — pass to compose-video as clipUrls[]
    clips_generated: clip_urls.length,
    clip_duration: Number(duration),   // always 5 or 10
    total_duration: clip_urls.length * Number(duration),
    timing_ms: { generation: genElapsed, total: totalMs },
  });
}
