/**
 * Avatar provider — Kling v2.1 pro → SyncLabs (via fal.ai) pipeline.
 * Single entry point for all talking-avatar generation in the codebase.
 */

import { fal } from "@fal-ai/client";
import { KLING_I2V_PRO, FAL_SYNC_LIPSYNC, extractVideoUrl } from "./video-models";

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
 * Stage 1 only: animate a still image into a 10-second head-motion video.
 * Returns the animated video URL.  Used by the stage-based worker.
 */
export async function animateImage(imageUrl: string): Promise<string> {
  console.log(`[FAL_REQUEST] animateImage fal_key_set=${!!(process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY)}`);
  configureFal();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (fal as any).subscribe(KLING_I2V_PRO, {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (fal as any).subscribe(FAL_SYNC_LIPSYNC, {
    input: {
      video_url: animatedVideoUrl,
      audio_url: audioUrl,
    },
    logs: true,
    onQueueUpdate: (update: { status: string }) => {
      console.log(`[synclabs] lipSyncVideo queue status=${update.status}`);
    },
  });

  console.log(`[synclabs] lipSyncVideo raw result keys=${Object.keys(result ?? {}).join(",")}`);

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

  // ── Stage 1: Kling v2.1 pro — animate image to 10s video ──────────────────
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lipsyncResult = await (fal as any).subscribe(FAL_SYNC_LIPSYNC, {
    input: {
      video_url: animatedVideoUrl,
      audio_url: audioUrl,
    },
    logs: true,
    onQueueUpdate: (update: { status: string }) => {
      console.log(`[synclabs] generateTalkingAvatar queue status=${update.status}`);
    },
  });

  console.log(`[synclabs] generateTalkingAvatar raw result keys=${Object.keys(lipsyncResult ?? {}).join(",")}`);

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
