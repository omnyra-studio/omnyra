/**
 * Avatar provider — Kling v2.1 pro → SyncLabs (via fal.ai) pipeline.
 * Single entry point for all talking-avatar generation in the codebase.
 */

import { fal } from "@fal-ai/client";
import { KLING_I2V_PRO, FAL_SYNC_LIPSYNC, extractVideoUrl } from "./video-models";
import { supabaseAdmin } from "./supabase/admin";

const RENDERS_BUCKET = "renders";

export interface TalkingAvatarInput {
  imageUrl: string;
  audioUrl: string;
}

export interface TalkingAvatarOutput {
  videoUrl: string;
  animatedVideoUrl: string;
  timingMs: {
    stage1_animate: number;
    stage2_lipsync: number;
    total: number;
  };
}

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
async function resolvePublicAudioUrl(audioUrl: string, ctx: string): Promise<string> {
  // Phase 1: HEAD probe
  let headStatus = 0;
  try {
    const headRes = await fetch(audioUrl, { method: "HEAD" });
    headStatus = headRes.status;
    const headLen  = headRes.headers.get("content-length") ?? "none";
    const headType = headRes.headers.get("content-type")   ?? "none";
    console.log(`${ctx} AUDIO_HEAD status=${headStatus} content-length=${headLen} content-type=${headType} url=${audioUrl}`);

    if (headRes.ok && headLen !== "0") {
      // URL is publicly accessible — use as-is
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

/**
 * Stage 2 only: lipsync an animated video with an audio track via fal-ai/sync-lipsync.
 * Returns the lipsynced video URL.  Used by the stage-based worker.
 */
export async function lipSyncVideo(
  animatedVideoUrl: string,
  audioUrl: string,
): Promise<string> {
  console.log(`[synclabs] lipSyncVideo fal_key_set=${!!(process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY)}`);
  configureFal();

  console.log(`[synclabs] lipSyncVideo submit video_url=${animatedVideoUrl.substring(0, 80)} audio_url=${audioUrl.substring(0, 80)}`);

  // Phase 7: Validate and (if needed) mirror audio URL to fal.ai CDN
  const resolvedAudioUrl = await resolvePublicAudioUrl(audioUrl, "[synclabs] lipSyncVideo");

  let result: unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = await (fal as any).subscribe(FAL_SYNC_LIPSYNC, {
      input: {
        video_url:  animatedVideoUrl,
        audio_url:  resolvedAudioUrl,
        model_name: "sync-1.9.0-beta",
      },
      logs: true,
      onEnqueue: (requestId: string) => {
        console.log(`[synclabs] lipSyncVideo ENQUEUED requestId=${requestId} endpoint=${FAL_SYNC_LIPSYNC}`);
      },
      onQueueUpdate: (update: unknown) => {
        console.log(`[synclabs] lipSyncVideo QUEUE_UPDATE=${JSON.stringify(update)}`);
      },
    });
  } catch (falErr) {
    const e = falErr as { name?: string; message?: string; status?: number; body?: unknown; requestId?: string };
    console.error(`[synclabs] lipSyncVideo FAL_THROW ERROR_CLASS=${e.name ?? "unknown"}`);
    console.error(`[synclabs] lipSyncVideo FAL_THROW ERROR_STATUS=${e.status ?? "none"}`);
    console.error(`[synclabs] lipSyncVideo FAL_THROW ERROR_BODY=${JSON.stringify(e.body ?? null)}`);
    console.error(`[synclabs] lipSyncVideo FAL_THROW ERROR_DETAIL=${JSON.stringify((e.body as { detail?: unknown } | null)?.detail ?? null)}`);
    console.error(`[synclabs] lipSyncVideo FAL_THROW REQUEST_ID=${e.requestId ?? "none"}`);
    console.error(`[synclabs] lipSyncVideo FAL_THROW ENDPOINT=${FAL_SYNC_LIPSYNC}`);
    console.error(`[synclabs] lipSyncVideo FAL_THROW MESSAGE=${e.message ?? String(falErr)}`);
    throw falErr;
  }

  console.log(`[synclabs] lipSyncVideo RESULT_FULL=${JSON.stringify(result)}`);

  const url =
    extractVideoUrl(result) ??
    (result as { video?: { url?: string } })?.video?.url ??
    (result as { output?: { video_url?: string } })?.output?.video_url ??
    (result as { video_url?: string })?.video_url;

  if (!url) {
    throw new Error(
      `fal sync-lipsync returned no video URL — result=${JSON.stringify(result).substring(0, 300)}`,
    );
  }
  console.log(`[synclabs] lipSyncVideo SUCCESS url=${url.substring(0, 80)}`);
  return url;
}

export async function generateTalkingAvatar(
  input: TalkingAvatarInput,
): Promise<TalkingAvatarOutput> {
  const { imageUrl, audioUrl } = input;
  const t0 = Date.now();

  configureFal();

  // ── Stage 1: Kling v2.1 pro — animate image to 10s video ─────────────────
  const s1T0 = Date.now();
  console.log(`[TIMING] avatar STAGE1_ANIMATE start`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const klingResult = await (fal as any).subscribe(KLING_I2V_PRO, {
    input: {
      image_url:       imageUrl,
      prompt:          ANIMATE_PROMPT,
      negative_prompt: ANIMATE_NEGATIVE,
      duration:        10,
      aspect_ratio:    "9:16",
      cfg_scale:       0.35,
    },
    logs:         false,
    pollInterval: KLING_POLL_MS,
  });

  const animatedVideoUrl =
    extractVideoUrl(klingResult) ??
    (klingResult as { video?: { url?: string } })?.video?.url ??
    (klingResult as { data?: { video?: { url?: string } } })?.data?.video?.url;

  if (!animatedVideoUrl) {
    throw new Error(
      `Kling animate returned no video URL — keys=${Object.keys(klingResult ?? {}).join(",")}`,
    );
  }
  const s1Ms = Date.now() - s1T0;
  console.log(`[TIMING] avatar STAGE1_ANIMATE complete ${s1Ms}ms`);

  // ── Stage 2: fal-ai/sync-lipsync ──────────────────────────────────────────
  const s2T0 = Date.now();
  console.log(`[TIMING] avatar STAGE2_LIPSYNC start`);
  console.log(`[synclabs] generateTalkingAvatar submit video_url=${animatedVideoUrl.substring(0, 80)} audio_url=${audioUrl.substring(0, 80)}`);

  // Phase 7: Validate and (if needed) mirror audio URL to fal.ai CDN
  const resolvedAudioUrl = await resolvePublicAudioUrl(audioUrl, "[synclabs] generateTalkingAvatar");

  let lipsyncResult: unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lipsyncResult = await (fal as any).subscribe(FAL_SYNC_LIPSYNC, {
      input: {
        video_url:  animatedVideoUrl,
        audio_url:  resolvedAudioUrl,
        model_name: "sync-1.9.0-beta",
      },
      logs: true,
      onEnqueue: (requestId: string) => {
        console.log(`[synclabs] generateTalkingAvatar ENQUEUED requestId=${requestId} endpoint=${FAL_SYNC_LIPSYNC}`);
      },
      onQueueUpdate: (update: unknown) => {
        console.log(`[synclabs] generateTalkingAvatar QUEUE_UPDATE=${JSON.stringify(update)}`);
      },
    });
  } catch (falErr) {
    const e = falErr as { name?: string; message?: string; status?: number; body?: unknown; requestId?: string };
    console.error(`[synclabs] generateTalkingAvatar FAL_THROW ERROR_CLASS=${e.name ?? "unknown"}`);
    console.error(`[synclabs] generateTalkingAvatar FAL_THROW ERROR_STATUS=${e.status ?? "none"}`);
    console.error(`[synclabs] generateTalkingAvatar FAL_THROW ERROR_BODY=${JSON.stringify(e.body ?? null)}`);
    console.error(`[synclabs] generateTalkingAvatar FAL_THROW ERROR_DETAIL=${JSON.stringify((e.body as { detail?: unknown } | null)?.detail ?? null)}`);
    console.error(`[synclabs] generateTalkingAvatar FAL_THROW REQUEST_ID=${e.requestId ?? "none"}`);
    console.error(`[synclabs] generateTalkingAvatar FAL_THROW ENDPOINT=${FAL_SYNC_LIPSYNC}`);
    console.error(`[synclabs] generateTalkingAvatar FAL_THROW MESSAGE=${e.message ?? String(falErr)}`);
    throw falErr;
  }

  console.log(`[synclabs] generateTalkingAvatar RESULT_FULL=${JSON.stringify(lipsyncResult)}`);

  const videoUrl =
    extractVideoUrl(lipsyncResult) ??
    (lipsyncResult as { video?: { url?: string } })?.video?.url ??
    (lipsyncResult as { output?: { video_url?: string } })?.output?.video_url ??
    (lipsyncResult as { video_url?: string })?.video_url;

  if (!videoUrl) {
    throw new Error(
      `fal sync-lipsync returned no video URL — result=${JSON.stringify(lipsyncResult).substring(0, 300)}`,
    );
  }

  const s2Ms = Date.now() - s2T0;
  console.log(`[TIMING] avatar STAGE2_LIPSYNC complete ${s2Ms}ms`);

  return {
    videoUrl,
    animatedVideoUrl,
    timingMs: {
      stage1_animate: s1Ms,
      stage2_lipsync: s2Ms,
      total: Date.now() - t0,
    },
  };
}
