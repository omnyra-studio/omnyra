/**
 * Atlas Cloud — Seedance v1.5 Fast video generation.
 * Replaces fal.ai Seedance. Submit → poll → return video URL.
 *
 * Pattern: POST /v1/video → { request_id } → poll GET /v1/jobs/{id} → { status, output }
 * Timeout: 240s. Poll interval: 2s.
 *
 * Env required: ATLAS_CLOUD_API_KEY, ATLAS_CLOUD_BASE_URL (default https://api.atlas-ml.com)
 */

const BASE_URL         = (process.env.ATLAS_CLOUD_BASE_URL ?? "https://api.atlas-ml.com").replace(/\/$/, "");
const POLL_INTERVAL_MS = 2_000;
const TIMEOUT_MS       = 240_000;

export type AtlasAspectRatio = "9:16" | "16:9" | "1:1";
export type AtlasResolution  = "480p" | "720p";

export interface AtlasVideoParams {
  prompt:       string;
  imageUrl?:    string;
  durationSec?: number;
  aspectRatio?: AtlasAspectRatio;
  resolution?:  AtlasResolution;
  seed?:        number;
  sceneNumber?: number;
}

export interface AtlasVideoResult {
  videoUrl:      string;
  modelUsed:     string;
  generationMs:  number;
  seed:          number;
}

function getApiKey(): string {
  const key = process.env.ATLAS_CLOUD_API_KEY ?? "";
  if (!key) throw new Error("ATLAS_CLOUD_API_KEY not configured — required for Atlas Cloud video generation");
  return key;
}

async function submitJob(params: AtlasVideoParams, apiKey: string): Promise<string> {
  const body: Record<string, unknown> = {
    model:        "seedance-v1.5-fast",
    prompt:       params.prompt.trim(),
    duration:     params.durationSec ?? 5,
    aspect_ratio: params.aspectRatio  ?? "9:16",
    resolution:   params.resolution   ?? "720p",
    seed:         params.seed         ?? (Date.now() % 999_999_999),
  };
  if (params.imageUrl) body.image_url = params.imageUrl;

  const res = await fetch(`${BASE_URL}/v1/video`, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`[ATLAS_ERROR] submit HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }

  const json = await res.json() as { request_id?: string; id?: string; job_id?: string };
  const requestId = json.request_id ?? json.id ?? json.job_id;
  if (!requestId) throw new Error(`[ATLAS_ERROR] no request_id in submit response: ${JSON.stringify(json).slice(0, 200)}`);
  return requestId;
}

async function pollJob(
  requestId:   string,
  apiKey:      string,
  sceneNumber: number | undefined,
  startMs:     number,
): Promise<string> {
  const deadline = startMs + TIMEOUT_MS;
  let attempt = 0;

  while (true) {
    if (Date.now() > deadline) {
      throw new Error(`[ATLAS_ERROR] scene=${sceneNumber ?? "?"} timeout after ${TIMEOUT_MS / 1000}s (${attempt} polls)`);
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    attempt++;

    const res = await fetch(`${BASE_URL}/v1/jobs/${requestId}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`[ATLAS_ERROR] poll HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    const json = await res.json() as {
      status?:  string;
      state?:   string;
      output?:  string | { url?: string };
      url?:     string;
      error?:   string;
    };

    const status = (json.status ?? json.state ?? "").toLowerCase();

    if (attempt % 10 === 0) {
      const elapsedSec = Math.round((Date.now() - startMs) / 1000);
      console.info(`[ATLAS_POLL] scene=${sceneNumber ?? "?"} id=${requestId} attempt=${attempt} status=${status} elapsed=${elapsedSec}s`);
    }

    if (status === "failed" || status === "error" || status === "cancelled") {
      throw new Error(`[ATLAS_ERROR] scene=${sceneNumber ?? "?"} job ${status}: ${json.error ?? "unknown"}`);
    }

    if (status === "completed" || status === "succeeded" || status === "done" || status === "success") {
      const raw = json.output;
      const videoUrl =
        (typeof raw === "string" ? raw : raw?.url) ??
        json.url ?? "";
      if (!videoUrl) {
        throw new Error(`[ATLAS_ERROR] scene=${sceneNumber ?? "?"} no video URL in completed response: ${JSON.stringify(json).slice(0, 200)}`);
      }
      return videoUrl;
    }
  }
}

/**
 * Generate a single video clip via Atlas Cloud Seedance v1.5 Fast.
 *
 * @param imageUrl  - optional reference image for image-to-video mode
 * @param prompt    - director-prose prompt (see buildAtlasPrompt)
 * @param durationSec - clip length in seconds (default 5)
 * @param seed      - deterministic seed; caller should use baseSeed + sceneIndex
 * @param options   - aspect ratio, resolution, scene number for logging
 */
export async function generateVideoClip(
  imageUrl:    string | undefined,
  prompt:      string,
  durationSec: number,
  seed:        number,
  options:     { aspectRatio?: AtlasAspectRatio; resolution?: AtlasResolution; sceneNumber?: number } = {},
): Promise<AtlasVideoResult> {
  const startMs  = Date.now();
  const apiKey   = getApiKey();
  const scene    = options.sceneNumber ?? "?";
  const mode     = imageUrl ? "i2v" : "t2v";

  console.info(`[ATLAS_REQUEST] scene=${scene} model=seedance-v1.5-fast mode=${mode} duration=${durationSec}s seed=${seed}`);
  console.info(`[ATLAS_PROMPT] scene=${scene}: ${prompt.substring(0, 150)}`);

  const requestId = await submitJob(
    {
      prompt,
      imageUrl,
      durationSec,
      seed,
      aspectRatio: options.aspectRatio ?? "9:16",
      resolution:  options.resolution  ?? "720p",
      sceneNumber: options.sceneNumber,
    },
    apiKey,
  );

  console.info(`[ATLAS_SUBMITTED] scene=${scene} requestId=${requestId}`);

  const videoUrl    = await pollJob(requestId, apiKey, options.sceneNumber, startMs);
  const generationMs = Date.now() - startMs;

  console.info(`[ATLAS_DONE] scene=${scene} elapsed=${Math.round(generationMs / 1000)}s url=${videoUrl.substring(0, 80)}`);

  return {
    videoUrl,
    modelUsed:    "seedance-v1.5-fast",
    generationMs,
    seed,
  };
}
