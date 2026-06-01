/**
 * Avatar provider — Kling v2.1 pro → SyncLabs pipeline.
 * Single entry point for all talking-avatar generation in the codebase.
 */

import { fal } from "@fal-ai/client";
import { KLING_I2V_PRO, extractVideoUrl } from "./video-models";

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

const SYNCLABS_BASE = "https://api.synclabs.so";
const SYNCLABS_TIMEOUT_MS = 60_000;
const KLING_POLL_MS = 4_000;

async function pollSyncLabs(
  jobId: string,
  apiKey: string,
  intervalMs: number,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const res = await fetch(`${SYNCLABS_BASE}/video/${jobId}`, {
      headers: { "x-api-key": apiKey },
    });
    if (!res.ok) throw new Error(`SyncLabs poll returned ${res.status}`);
    const data = await res.json() as {
      id: string;
      status: string;
      url?: string;
      videoUrl?: string;
      error?: string;
    };
    const url = data.url ?? data.videoUrl;
    if (data.status === "completed" && url) return url;
    if (data.status === "failed" || data.status === "error") {
      throw new Error(`SyncLabs lipsync failed: ${data.error ?? data.status}`);
    }
    console.log(`[avatar-provider] SyncLabs status=${data.status} jobId=${jobId}`);
  }
  throw new Error(`SyncLabs lipsync timed out after ${timeoutMs / 1000}s`);
}

/**
 * Stage 1 only: animate a still image into a 10-second head-motion video.
 * Returns the animated video URL.  Used by the stage-based worker.
 */
export async function animateImage(imageUrl: string): Promise<string> {
  const falKey = process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY;
  if (!falKey) throw new Error("FAL_API_KEY not configured");
  fal.config({ credentials: falKey });

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
  return url;
}

/**
 * Stage 2 only: lipsync an animated video with an audio track via SyncLabs.
 * Returns the lipsynced video URL.  Used by the stage-based worker.
 */
export async function lipSyncVideo(
  animatedVideoUrl: string,
  audioUrl: string,
): Promise<string> {
  const syncKey = process.env.SYNCLABS_API_KEY;
  console.log(`[synclabs] lipSyncVideo key_present=${!!syncKey}`);
  if (!syncKey) throw new Error("SYNCLABS_API_KEY not configured");

  const requestBody = {
    videoUrl:   animatedVideoUrl,
    audioUrl,
    synergize:  true,
    maxCredits: 120,
    webhookUrl: null,
  };
  console.log(`[synclabs] lipSyncVideo submit body=${JSON.stringify(requestBody)}`);

  let submitRes: Response;
  try {
    submitRes = await fetch(`${SYNCLABS_BASE}/video`, {
      method:  "POST",
      headers: { "x-api-key": syncKey, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    console.error(`[synclabs] lipSyncVideo fetch threw: ${msg}`);
    throw new Error(`SyncLabs fetch failed: ${msg}`);
  }

  const statusCode = submitRes.status;
  const rawText = await submitRes.text().catch(() => `<unreadable>`);
  console.log(`[synclabs] lipSyncVideo response status=${statusCode} body=${rawText.substring(0, 500)}`);

  if (!submitRes.ok) {
    throw new Error(`SyncLabs submit failed: ${statusCode} — ${rawText.substring(0, 200)}`);
  }

  let submitData: { id?: string; error?: string };
  try {
    submitData = JSON.parse(rawText);
  } catch {
    throw new Error(`SyncLabs response not valid JSON: ${rawText.substring(0, 200)}`);
  }

  if (!submitData.id) {
    throw new Error(
      `SyncLabs returned no job id — ${JSON.stringify(submitData).substring(0, 200)}`,
    );
  }

  return pollSyncLabs(submitData.id, syncKey, 4_000, SYNCLABS_TIMEOUT_MS);
}

export async function generateTalkingAvatar(
  input: TalkingAvatarInput,
): Promise<TalkingAvatarOutput> {
  const { imageUrl, audioUrl } = input;
  const t0 = Date.now();

  const falKey = process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY;
  if (!falKey) throw new Error("FAL_API_KEY not configured");
  const syncKey = process.env.SYNCLABS_API_KEY;
  if (!syncKey) throw new Error("SYNCLABS_API_KEY not configured");

  fal.config({ credentials: falKey });

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

  // ── Stage 2: SyncLabs lipsync ──────────────────────────────────────────────
  const s2T0 = Date.now();
  console.log(`[TIMING] avatar STAGE2_LIPSYNC start`);
  console.log(`[synclabs] generateTalkingAvatar key_present=${!!syncKey}`);

  const gta_requestBody = {
    videoUrl:    animatedVideoUrl,
    audioUrl,
    synergize:   true,
    maxCredits:  120,
    webhookUrl:  null,
  };
  console.log(`[synclabs] generateTalkingAvatar submit body=${JSON.stringify(gta_requestBody)}`);

  let gta_submitRes: Response;
  try {
    gta_submitRes = await fetch(`${SYNCLABS_BASE}/video`, {
      method:  "POST",
      headers: { "x-api-key": syncKey, "Content-Type": "application/json" },
      body: JSON.stringify(gta_requestBody),
    });
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    console.error(`[synclabs] generateTalkingAvatar fetch threw: ${msg}`);
    throw new Error(`SyncLabs fetch failed: ${msg}`);
  }

  const gta_statusCode = gta_submitRes.status;
  const gta_rawText = await gta_submitRes.text().catch(() => `<unreadable>`);
  console.log(`[synclabs] generateTalkingAvatar response status=${gta_statusCode} body=${gta_rawText.substring(0, 500)}`);

  if (!gta_submitRes.ok) {
    throw new Error(`SyncLabs submit failed: ${gta_statusCode} — ${gta_rawText.substring(0, 200)}`);
  }

  let submitData: { id?: string; error?: string };
  try {
    submitData = JSON.parse(gta_rawText);
  } catch {
    throw new Error(`SyncLabs response not valid JSON: ${gta_rawText.substring(0, 200)}`);
  }

  if (!submitData.id) {
    throw new Error(`SyncLabs returned no job id — ${JSON.stringify(submitData).substring(0, 200)}`);
  }

  console.log(`[avatar-provider] SyncLabs job submitted: ${submitData.id}`);

  const videoUrl = await pollSyncLabs(submitData.id, syncKey, 4_000, SYNCLABS_TIMEOUT_MS);
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
