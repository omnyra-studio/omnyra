/**
 * Avatar provider — Kling v2.1 pro image animation.
 * Stage 1 only: animates a still portrait into a 10-second head-motion video.
 * Lipsync is now handled by Hedra (see lib/providers/hedra.ts).
 */

import { fal } from "@fal-ai/client";
import { KLING_I2V_PRO, extractVideoUrl } from "./video-models";
import { supabaseAdmin } from "./supabase/admin";

const RENDERS_BUCKET = "renders";

const ANIMATE_PROMPT =
  "natural head micro-movements, gentle eye blinks, soft breathing, " +
  "subtle expression shift, ultra realistic portrait, life-like, calm, " +
  "no speaking, no gestures, no dramatic movement, no mouth movement";

const ANIMATE_NEGATIVE =
  "talking, mouth moving, speaking, gestures, dramatic motion, blur, " +
  "body movement, hands, sudden motion, exaggerated expression";

const KLING_POLL_MS = 4_000;

function configureFal(): void {
  const falKey = process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY;
  if (!falKey) throw new Error("FAL_API_KEY not configured");
  fal.config({ credentials: falKey });
}

/**
 * Ensures the audio URL is publicly accessible before sending it to fal.ai.
 *
 * Phase 1 — HEAD probe: verifies the URL returns HTTP 200 with a non-zero body.
 * Phase 6 — fal CDN mirror: if the URL is private (Supabase bucket not public),
 *   downloads the file via service-role client (bypasses RLS) and re-uploads it
 *   to fal.ai CDN, which fal.ai can always access.
 * Phase 7 — gate: throws AUDIO_URL_NOT_PUBLIC if mirror also fails.
 *
 * Returns the URL that fal.ai should use — either the original or the fal CDN copy.
 */
export async function resolvePublicAudioUrl(audioUrl: string, ctx: string): Promise<string> {
  // Phase 1: HEAD probe
  let headStatus = 0;
  try {
    const headRes = await fetch(audioUrl, { method: "HEAD" });
    headStatus = headRes.status;
    const headLen  = headRes.headers.get("content-length") ?? "none";
    const headType = headRes.headers.get("content-type")   ?? "none";
    console.log(`${ctx} AUDIO_HEAD status=${headStatus} content-length=${headLen} content-type=${headType} url=${audioUrl}`);

    if (headRes.ok && headLen !== "0") {
      return audioUrl;
    }
    if (headRes.ok && headLen === "0") {
      console.error(`${ctx} AUDIO_HEAD OK but content-length=0 — object may be empty`);
    }
  } catch (headErr) {
    const msg = headErr instanceof Error ? headErr.message : String(headErr);
    console.error(`${ctx} AUDIO_HEAD ERROR: ${msg} url=${audioUrl}`);
  }

  // Phase 6: URL not publicly reachable — mirror to fal.ai CDN
  console.log(`${ctx} AUDIO_URL_NOT_PUBLIC HEAD=${headStatus} — mirroring to fal.ai CDN`);

  const marker = `/object/public/${RENDERS_BUCKET}/`;
  const idx = audioUrl.indexOf(marker);
  if (idx === -1) {
    throw new Error(`AUDIO_URL_NOT_PUBLIC: cannot extract storage path from url=${audioUrl}`);
  }
  const storagePath = decodeURIComponent(audioUrl.slice(idx + marker.length));
  console.log(`${ctx} SUPABASE_DOWNLOAD path=${storagePath}`);

  const { data: blob, error: downloadErr } = await supabaseAdmin.storage
    .from(RENDERS_BUCKET)
    .download(storagePath);

  if (downloadErr || !blob) {
    throw new Error(
      `AUDIO_URL_NOT_PUBLIC: supabase download failed path=${storagePath} error=${downloadErr?.message ?? "no data"}`,
    );
  }

  const audioBlob = new Blob([await blob.arrayBuffer()], { type: "audio/mpeg" });
  console.log(`${ctx} FAL_STORAGE_UPLOAD size=${audioBlob.size}`);

   
  const falUrl = await (fal as any).storage.upload(audioBlob) as string;
  console.log(`${ctx} FAL_CDN_URL=${falUrl}`);
  return falUrl;
}

/**
 * Stage 1 only: animate a still image into a 10-second head-motion video.
 * Returns the animated video URL.  Used by the stage-based worker.
 * @param visualPrompt Optional scene-specific Kling prompt from Director Core.
 *                     Falls back to ANIMATE_PROMPT when not provided.
 */
export async function animateImage(imageUrl: string, visualPrompt?: string): Promise<string> {
  console.log(`[FAL_REQUEST] animateImage fal_key_set=${!!(process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY)}`);
  configureFal();

   
  const result = await (fal as any).subscribe(KLING_I2V_PRO, {
    input: {
      image_url:       imageUrl,
      prompt:          visualPrompt ?? ANIMATE_PROMPT,
      negative_prompt: ANIMATE_NEGATIVE,
      duration:        10,
      aspect_ratio:    "9:16",
      cfg_scale:       0.35,
    },
    logs:         false,
    pollInterval: KLING_POLL_MS,
  });

  const url =
    extractVideoUrl(result) ??
    (result as { video?: { url?: string } })?.video?.url ??
    (result as { data?: { video?: { url?: string } } })?.data?.video?.url;

  if (!url) {
    throw new Error(
      `Kling animate returned no video URL — keys=${Object.keys(result ?? {}).join(",")}`,
    );
  }
  console.log(`[FAL_RESPONSE] kling SUCCESS url=${url.substring(0, 80)}`);
  return url;
}
