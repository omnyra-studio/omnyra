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

export interface RunwayClipParams {
  prompt:      string;
  imageUrl?:   string;   // public HTTPS URL — required for i2v, omit for t2v
  duration:    5 | 10;
  aspectRatio: "9:16" | "16:9";
}

export interface RunwayClipResult {
  videoUrl:     string;
  generationMs: number;
}

function toRunwayRatio(ar: "9:16" | "16:9"): "720:1280" | "1280:720" {
  return ar === "9:16" ? "720:1280" : "1280:720";
}

function getClient(): RunwayML {
  const apiKey = process.env.RUNWAYML_API_SECRET;
  if (!apiKey) throw new Error("RUNWAYML_API_SECRET is not configured");
  return new RunwayML({ apiKey });
}

export async function generateRunwayClip(
  params: RunwayClipParams,
): Promise<RunwayClipResult> {
  const { prompt, imageUrl, duration, aspectRatio } = params;

  const client = getClient();
  const ratio  = toRunwayRatio(aspectRatio);
  const t0     = Date.now();

  // gen4_turbo supports both i2v (with promptImage) and t2v (without).
  // Omit promptImage entirely when no imageUrl is provided — empty string causes 400.
  const createPayload = imageUrl
    ? { model: "gen4_turbo" as const, promptText: prompt, ratio, duration, promptImage: imageUrl }
    : { model: "gen4_turbo" as const, promptText: prompt, ratio, duration };

  const submitted = await client.imageToVideo.create(
    createPayload as Parameters<typeof client.imageToVideo.create>[0],
  );
  const taskId    = submitted.id;

  console.log(
    `[RUNWAY] submitted task=${taskId} model=gen4_turbo ratio=${ratio} duration=${duration}s i2v=${!!imageUrl}`,
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
