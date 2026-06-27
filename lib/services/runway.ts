/**
 * Runway Gen-4 Turbo — image-to-video, text-to-video, image upscale,
 * video-to-video, and Seedance2 generation.
 *
 * Wraps @runwayml/sdk with inline polling (10s intervals, 4-min timeout).
 * Returns the same shape as generateKlingClip so the cinematic route can
 * swap providers transparently.
 *
 * Env: RUNWAYML_API_SECRET
 */

import RunwayML from "@runwayml/sdk";

const RUNWAY_POLL_INTERVAL_MS = 10_000;
const RUNWAY_TIMEOUT_MS       = 240_000; // 4 minutes max
const RUNWAY_UPSCALE_TIMEOUT  =  60_000; // 1 minute for upscale

// Only models accepted by the SDK imageToVideo endpoint.
// gen3a_turbo is NOT valid here — it was a Gen-3 text-to-video model.
export type RunwayImageToVideoModel = "gen4_turbo" | "gen4.5";

export interface RunwayClipParams {
  prompt:      string;
  imageUrl?:   string;   // public HTTPS URL — required for i2v, omit for t2v
  duration:    5 | 10;
  aspectRatio: "9:16" | "16:9";
  model?:      RunwayImageToVideoModel; // default: gen4_turbo
}

export interface RunwayClipResult {
  videoUrl:     string;
  generationMs: number;
}

// Valid ratio values for gen4_turbo imageToVideo per SDK types:
// '1280:720' | '720:1280' | '1104:832' | '832:1104' | '960:960' | '1584:672'
function toRunwayRatio(ar: "9:16" | "16:9"): "720:1280" | "1280:720" {
  return ar === "9:16" ? "720:1280" : "1280:720";
}

function getClient(): RunwayML {
  const apiKey = process.env.RUNWAYML_API_SECRET;
  if (!apiKey) throw new Error("RUNWAYML_API_SECRET is not configured");
  return new RunwayML({ apiKey });
}

const MAX_SUBMIT_ATTEMPTS = 2;
const RETRY_DELAY_MS      = 3_500;

export async function generateRunwayClip(
  params: RunwayClipParams,
): Promise<RunwayClipResult> {
  const { prompt, imageUrl, duration, aspectRatio, model: requestedModel = "gen4_turbo" } = params;

  // Guard: map any legacy gen3a_turbo references to gen4_turbo.
  // gen3a_turbo is not a valid imageToVideo model — only gen4_turbo and gen4.5 are accepted.
  const model: RunwayImageToVideoModel = requestedModel === "gen4_turbo" ? "gen4_turbo" : "gen4_turbo";

  const client = getClient();
  const ratio  = toRunwayRatio(aspectRatio);
  const t0     = Date.now();

  // Omit promptImage entirely when no imageUrl — empty string causes 400.
  // Field names match SDK gen4_turbo schema: promptText, promptImage, ratio, duration, model.
  const createPayload = imageUrl
    ? { model, promptText: prompt, ratio, duration, promptImage: imageUrl }
    : { model, promptText: prompt, ratio, duration };

  console.log(`[RUNWAY] payload model=${model} ratio=${ratio} duration=${duration}s i2v=${!!imageUrl} promptText="${prompt.substring(0, 80)}"`);

  // Submit with retry — handles 429 rate-limit and transient network errors
  let submitted: { id: string };
  for (let attempt = 1; attempt <= MAX_SUBMIT_ATTEMPTS; attempt++) {
    try {
      // Cast required: SDK type requires promptImage for gen4_turbo but we support
      // optional t2v (no image). The field is accepted by the API when omitted.
      submitted = await client.imageToVideo.create(
        createPayload as Parameters<typeof client.imageToVideo.create>[0],
      );
      break;
    } catch (err) {
      const status = (err as { status?: number }).status;
      const isRateLimit = status === 429;
      const isRetryable = isRateLimit || status === 503 || status === 502;
      if (attempt < MAX_SUBMIT_ATTEMPTS && isRetryable) {
        const delay = isRateLimit ? 3_500 : RETRY_DELAY_MS;
        console.warn(`[RUNWAY] submit attempt ${attempt} failed status=${status} — retrying in ${delay}ms`);
        await new Promise<void>(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  const taskId = submitted!.id;

  console.log(
    `[RUNWAY] submitted task=${taskId} model=${requestedModel} ratio=${ratio} duration=${duration}s i2v=${!!imageUrl}`,
  );

  // Poll until terminal state
  const deadline = t0 + RUNWAY_TIMEOUT_MS;
  let task = await client.tasks.retrieve(taskId);

  while (!["SUCCEEDED", "FAILED", "CANCELLED"].includes(task.status ?? "")) {
    if (Date.now() > deadline) {
      throw new Error(
        `Runway task=${taskId} timed out after ${RUNWAY_TIMEOUT_MS / 1000}s (status=${task.status})`,
      );
    }
    await new Promise<void>(r => setTimeout(r, RUNWAY_POLL_INTERVAL_MS));
    task = await client.tasks.retrieve(taskId);
    console.log(
      `[RUNWAY] poll task=${taskId} status=${task.status} elapsed=${Math.round((Date.now() - t0) / 1000)}s`,
    );
  }

  if (task.status !== "SUCCEEDED") {
    throw new Error(
      `Runway task=${taskId} ended with status=${task.status}`,
    );
  }

  const output  = (task as { output?: string[] }).output;
  const videoUrl = Array.isArray(output) ? output[0] : undefined;
  if (!videoUrl) {
    throw new Error(`Runway task=${taskId} succeeded but output is empty`);
  }

  const generationMs = Date.now() - t0;
  console.log(
    `[RUNWAY] done task=${taskId} ${generationMs}ms url=${videoUrl.substring(0, 80)}`,
  );

  return { videoUrl, generationMs };
}

// ── Generic task poller (reused by upscale, textToVideo, videoToVideo) ──────

async function pollRunwayTask(
  client:     RunwayML,
  taskId:     string,
  timeoutMs:  number,
  label:      string,
): Promise<string> {
  const t0       = Date.now();
  const deadline = t0 + timeoutMs;
  let task = await client.tasks.retrieve(taskId);

  while (!["SUCCEEDED", "FAILED", "CANCELLED"].includes(task.status ?? "")) {
    if (Date.now() > deadline) {
      throw new Error(`${label} task=${taskId} timed out after ${timeoutMs / 1000}s`);
    }
    await new Promise<void>(r => setTimeout(r, RUNWAY_POLL_INTERVAL_MS));
    task = await client.tasks.retrieve(taskId);
    console.log(`[RUNWAY_POLL] ${label} task=${taskId} status=${task.status} elapsed=${Math.round((Date.now() - t0) / 1000)}s`);
  }

  if (task.status !== "SUCCEEDED") {
    throw new Error(`${label} task=${taskId} ended with status=${task.status}`);
  }

  const output = (task as { output?: string[] }).output;
  const url    = Array.isArray(output) ? output[0] : undefined;
  if (!url) throw new Error(`${label} task=${taskId} succeeded but output is empty`);
  return url;
}

// ── Image Upscale (Magnific precision 2×) ───────────────────────────────────

/**
 * Upscale a scene image 2× with Runway Magnific before feeding it to i2v.
 * Higher-res source → sharper, more detailed video output.
 * Non-fatal — falls back to original URL on failure.
 */
export async function upscaleImageForRunway(imageUri: string): Promise<string> {
  const client = getClient();
  const t0     = Date.now();
  console.log(`[RUNWAY_UPSCALE] start url=${imageUri.substring(0, 80)}`);

  const submitted = await client.imageUpscale.create({
    imageUri,
    model:       "magnific_precision_upscaler_v2",
    flavor:      "photo",
    scaleFactor: 2,
    sharpen:     30,
    ultraDetail: 40,
  });

  const upscaledUrl = await pollRunwayTask(client, submitted.id, RUNWAY_UPSCALE_TIMEOUT, "UPSCALE");
  console.log(`[RUNWAY_UPSCALE] done ${Date.now() - t0}ms url=${upscaledUrl.substring(0, 80)}`);
  return upscaledUrl;
}

// ── Seedance2 via textToVideo (better i2v — uses image as first-frame ref) ──

export interface RunwaySeedanceParams {
  prompt:      string;
  imageUrl?:   string;  // used as first-frame reference — acts as i2v
  duration?:   number;  // seconds, default 10
  aspectRatio: "9:16" | "16:9";
  fast?:       boolean; // true = seedance2_fast, false = seedance2 (quality)
}

/**
 * Generate a clip using Runway's Seedance2 model via the textToVideo endpoint.
 * When imageUrl is provided it's used as a first-frame reference (i2v equivalent)
 * with significantly higher fidelity than gen4_turbo.
 */
export async function generateRunwaySeedanceClip(
  params: RunwaySeedanceParams,
): Promise<RunwayClipResult> {
  const { prompt, imageUrl, duration = 10, aspectRatio, fast = false } = params;
  const client = getClient();
  const t0     = Date.now();
  const model  = fast ? "seedance2_fast" : "seedance2";

  // Seedance2 uses Runway-style ratios (width:height)
  const ratio = aspectRatio === "9:16" ? "720:1280" : "1280:720";

  const body = {
    model,
    promptText: prompt,
    duration,
    ratio,
    audio: false,
    ...(imageUrl ? { references: [{ uri: imageUrl, position: "first" as const }] } : {}),
  };

  console.log(`[RUNWAY_SEEDANCE] model=${model} ratio=${ratio} duration=${duration}s hasImage=${!!imageUrl}`);
  const submitted = await client.textToVideo.create(body as Parameters<typeof client.textToVideo.create>[0]);

  const videoUrl     = await pollRunwayTask(client, submitted.id, RUNWAY_TIMEOUT_MS, "SEEDANCE");
  const generationMs = Date.now() - t0;
  console.log(`[RUNWAY_SEEDANCE] done ${generationMs}ms url=${videoUrl.substring(0, 80)}`);
  return { videoUrl, generationMs };
}

// ── VideoToVideo Seedance2 enhance (quality post-processing per clip) ────────

export interface RunwayVideoEnhanceParams {
  videoUrl:    string;
  prompt?:     string;
  duration?:   number;
  aspectRatio: "9:16" | "16:9";
}

/**
 * Re-run an existing 10s clip through Runway Seedance2 video-to-video
 * to enhance detail, texture, and temporal consistency.
 * Only used in quality speedMode — adds ~60s per clip.
 */
export async function enhanceClipWithVideoToVideo(
  params: RunwayVideoEnhanceParams,
): Promise<RunwayClipResult> {
  const { videoUrl, prompt, duration = 10, aspectRatio } = params;
  const client = getClient();
  const t0     = Date.now();
  const ratio  = aspectRatio === "9:16" ? "720:1280" : "1280:720";

  console.log(`[RUNWAY_V2V] start seedance2 videoUrl=${videoUrl.substring(0, 80)}`);

  const body = {
    model:       "seedance2" as const,
    promptVideo: videoUrl,
    duration,
    ratio,
    audio:       false,
    ...(prompt ? { promptText: prompt.slice(0, 500) } : {}),
  };

  const submitted = await client.videoToVideo.create(body);
  const enhancedUrl  = await pollRunwayTask(client, submitted.id, RUNWAY_TIMEOUT_MS, "V2V");
  const generationMs = Date.now() - t0;
  console.log(`[RUNWAY_V2V] done ${generationMs}ms url=${enhancedUrl.substring(0, 80)}`);
  return { videoUrl: enhancedUrl, generationMs };
}
