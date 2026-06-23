/**
 * Kling 2.6 Pro — direct API client.
 *
 * Auth priority:
 *   1. KLING_API_KEY  → simple Bearer token (new portal keys: api-key-kling-...)
 *   2. KLING_ACCESS_KEY + KLING_SECRET_KEY → HS256 JWT (legacy)
 *
 * Endpoints (base from KLING_API_BASE env var):
 *   POST /v1/videos/image2video  → create i2v task
 *   POST /v1/videos/text2video   → create t2v task
 *   GET  /v1/videos/image2video/{task_id}  → poll
 *   GET  /v1/videos/text2video/{task_id}   → poll
 */

import crypto from "crypto";

// ── Auth ─────────────────────────────────────────────────────────────────────

function getApiBase(): string {
  return (process.env.KLING_API_BASE?.trim() ?? "https://api-singapore.klingai.com").replace(/\/$/, "");
}

function getAuthToken(): string {
  // Prefer direct API key (newer portal keys)
  const directKey = process.env.KLING_API_KEY?.trim();
  if (directKey) return directKey;

  // Fall back to JWT from access_key + secret_key
  const accessKey = process.env.KLING_ACCESS_KEY?.trim() ?? "";
  const secretKey = process.env.KLING_SECRET_KEY?.trim() ?? "";
  if (!accessKey || !secretKey) {
    throw new Error("KLING_API_KEY (or KLING_ACCESS_KEY + KLING_SECRET_KEY) not configured");
  }
  return generateJWT(accessKey, secretKey);
}

function generateJWT(accessKey: string, secretKey: string): string {
  const now     = Math.floor(Date.now() / 1000);
  const payload = { iss: accessKey, exp: now + 1800, nbf: now - 5 };
  const header  = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body    = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig     = crypto.createHmac("sha256", secretKey).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function isDirectKlingAvailable(): boolean {
  return !!(process.env.KLING_API_KEY || (process.env.KLING_ACCESS_KEY && process.env.KLING_SECRET_KEY));
}

// ── Response types ────────────────────────────────────────────────────────────

interface KlingCreateResponse {
  code:    number;
  message: string;
  data: {
    task_id:     string;
    task_status: string;
  };
}

interface KlingQueryResponse {
  code:    number;
  message: string;
  data: {
    task_id:          string;
    task_status:      string;
    task_status_msg?: string;
    task_result?: {
      videos?: Array<{ id?: string; url: string; duration?: string }>;
    };
  };
}

// ── generateKlingClip — primary function for cinematic route ──────────────────

export async function generateKlingClip(params: {
  prompt:          string;
  negativePrompt?: string;
  imageUrl?:       string;
  duration:        number;   // seconds — 5 or 10
  aspectRatio:     string;   // "9:16" | "16:9" | "1:1"
  mode:            "std" | "pro";
  motionStrength?: number;   // 0.0–1.0, default 0.5 if omitted
  seed?:           number;
  sceneNumber:     number;
}): Promise<{ videoUrl: string; generationMs: number }> {
  const POLL_FIRST_MS    = 1_000; // first check after 1s — clips sometimes finish fast
  const POLL_INTERVAL_MS = 3_000; // subsequent checks every 3s
  const MAX_POLL_MS      = 240_000; // 240s — covers slow Kling jobs within 300s route budget

  const startMs   = Date.now();
  const apiBase   = getApiBase();
  const token     = getAuthToken();
  const hasImage  = !!params.imageUrl?.startsWith("https://");
  const endpoint  = hasImage ? "/v1/videos/image2video" : "/v1/videos/text2video";
  const createUrl = `${apiBase}${endpoint}`;

  const body: Record<string, unknown> = {
    model_name:      "kling-v2-1",  // v3 pro stays "submitted" indefinitely; v2.1 pro completes in ~70-90s
    prompt:          params.prompt.slice(0, 2500),
    negative_prompt: params.negativePrompt?.slice(0, 500) ?? "",
    cfg_scale:       0.5,
    mode:            params.mode,
    duration:        String(params.duration),
    aspect_ratio:    params.aspectRatio,
  };
  if (hasImage) body.image = params.imageUrl;
  if (params.seed != null) body.seed = params.seed;
  if (params.motionStrength != null) body.motion_strength = params.motionStrength;

  console.log(`[KLING_DIRECT] scene=${params.sceneNumber} POST ${endpoint} model=kling-v3 mode=${params.mode} dur=${params.duration}s hasImage=${hasImage}`);

  const createRes = await fetch(createUrl, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body:   JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => "");
    throw new Error(`[KLING_DIRECT_CREATE_FAIL] scene=${params.sceneNumber} HTTP ${createRes.status}: ${errText.substring(0, 300)}`);
  }

  const createData = await createRes.json() as KlingCreateResponse;
  if (createData.code !== 0) {
    throw new Error(`[KLING_DIRECT_API_ERR] scene=${params.sceneNumber} code=${createData.code} msg=${createData.message}`);
  }

  const taskId  = createData.data.task_id;
  const pollUrl = `${apiBase}${endpoint}/${taskId}`;
  console.log(`[KLING_DIRECT] scene=${params.sceneNumber} task_id=${taskId} status=${createData.data.task_status}`);

  const deadline = Date.now() + MAX_POLL_MS;
  let firstPoll  = true;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, firstPoll ? POLL_FIRST_MS : POLL_INTERVAL_MS));
    firstPoll = false;

    let pollRes: Response | null = null;
    try {
      pollRes = await fetch(pollUrl, {
        headers: { "Authorization": `Bearer ${getAuthToken()}` },
        signal:  AbortSignal.timeout(15_000),
      });
    } catch (fetchErr) {
      console.warn(`[KLING_POLL] scene=${params.sceneNumber} fetch error: ${fetchErr instanceof Error ? fetchErr.message : fetchErr} — retrying`);
      continue;
    }

    if (!pollRes.ok) {
      console.warn(`[KLING_POLL] scene=${params.sceneNumber} HTTP ${pollRes.status} — retrying`);
      continue;
    }

    const pollData = await pollRes.json() as KlingQueryResponse;
    const status   = pollData.data?.task_status ?? "unknown";
    const elapsed  = Math.round((Date.now() - startMs) / 1000);

    console.log(`[KLING_POLL] scene=${params.sceneNumber} task_id=${taskId} status=${status} elapsed=${elapsed}s`);

    if (status === "succeed" || status === "completed") {
      const videoUrl = pollData.data?.task_result?.videos?.[0]?.url;
      if (!videoUrl) {
        throw new Error(`[KLING_DIRECT] scene=${params.sceneNumber} status=${status} but no video URL`);
      }
      const generationMs = Date.now() - startMs;
      console.log(`[KLING_DIRECT_DONE] scene=${params.sceneNumber} elapsed=${Math.round(generationMs / 1000)}s url=${videoUrl.substring(0, 80)}`);
      return { videoUrl, generationMs };
    }

    if (status === "failed" || status === "error") {
      const msg = pollData.data?.task_status_msg ?? "no reason given";
      throw new Error(`[KLING_DIRECT_FAILED] scene=${params.sceneNumber} task_id=${taskId} status=${status} msg=${msg}`);
    }
    // "submitted" | "processing" — keep polling
  }

  throw new Error(`[KLING_DIRECT_TIMEOUT] scene=${params.sceneNumber} exceeded ${MAX_POLL_MS / 1000}s`);
}

// ── Legacy adapter — kept for existing callers of generateKlingDirect ─────────

export interface DirectKlingInput {
  falModelId:      string;
  prompt:          string;
  negative_prompt: string;
  duration:        "5" | "10";
  aspect_ratio:    string;
  cfg_scale:       number;
  image_url?:      string;
}

export interface DirectKlingResult {
  video_url:  string;
  model_used: string;
  mode:       string;
}

export async function generateKlingDirect(
  input: DirectKlingInput,
  timeoutMs: number,
  label: string,
): Promise<DirectKlingResult> {
  const isI2V = !!input.image_url;
  const mode  = input.falModelId.includes("pro") ? "pro" : "std";

  const result = await generateKlingClip({
    prompt:          input.prompt,
    negativePrompt:  input.negative_prompt,
    imageUrl:        input.image_url,
    duration:        Number(input.duration),
    aspectRatio:     input.aspect_ratio,
    mode,
    sceneNumber:     0,
  });

  void timeoutMs; void label; void isI2V;

  return {
    video_url:  result.videoUrl,
    model_used: `direct:kling-v3:${mode}`,
    mode,
  };
}
