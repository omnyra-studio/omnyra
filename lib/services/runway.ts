/**
 * Runway Gen-4 Turbo — image-to-video and text-to-video generation.
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
