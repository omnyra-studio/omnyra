/**
 * Direct Kling API client — bypasses fal.ai markup (60-80% cost saving on Kling calls).
 *
 * Auth: KLING_ACCESS_KEY + KLING_SECRET_KEY → HS256 JWT (same pattern as generate-video-kling route).
 * API:  https://api.klingai.com/v1/videos/text2video  (T2V)
 *       https://api.klingai.com/v1/videos/image2video  (I2V)
 * Poll: GET /v1/videos/{type}/{taskId}  every 3s until status=succeed|failed
 */

import crypto from "crypto";

const KLING_BASE = "https://api.klingai.com";

// Model name map: fal-ai model ID → direct Kling model_name + mode
const FAL_TO_DIRECT: Record<string, { model_name: string; mode: "std" | "pro" }> = {
  "fal-ai/kling-video/v3/pro/text-to-video":      { model_name: "kling-v1-6", mode: "pro" },
  "fal-ai/kling-video/v3/pro/image-to-video":     { model_name: "kling-v1-6", mode: "pro" },
  "fal-ai/kling-video/v3/standard/text-to-video": { model_name: "kling-v1-6", mode: "std" },
  "fal-ai/kling-video/v3/standard/image-to-video":{ model_name: "kling-v1-6", mode: "std" },
  "fal-ai/kling-video/v2.1/pro/text-to-video":    { model_name: "kling-v1-6", mode: "pro" },
  "fal-ai/kling-video/v2.1/pro/image-to-video":   { model_name: "kling-v1-6", mode: "pro" },
  "fal-ai/kling-video/v1.6/pro/text-to-video":    { model_name: "kling-v1-6", mode: "pro" },
  "fal-ai/kling-video/v1.6/pro/image-to-video":   { model_name: "kling-v1-6", mode: "pro" },
  "fal-ai/kling-video/v1.6/standard/text-to-video":    { model_name: "kling-v1-6", mode: "std" },
  "fal-ai/kling-video/v1.6/standard/image-to-video":   { model_name: "kling-v1-6", mode: "std" },
};

function generateJWT(accessKey: string, secretKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: accessKey, exp: now + 1800, nbf: now - 5 };
  const header  = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body    = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig     = crypto.createHmac("sha256", secretKey).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function isDirectKlingAvailable(): boolean {
  return !!(process.env.KLING_ACCESS_KEY && process.env.KLING_SECRET_KEY);
}

export interface DirectKlingInput {
  falModelId:      string;           // e.g. "fal-ai/kling-video/v3/pro/text-to-video"
  prompt:          string;
  negative_prompt: string;
  duration:        "5" | "10";
  aspect_ratio:    string;
  cfg_scale:       number;
  image_url?:      string;           // present → I2V
}

export interface DirectKlingResult {
  video_url:    string;
  model_used:   string;
  mode:         string;
}

export async function generateKlingDirect(
  input: DirectKlingInput,
  timeoutMs: number,
  label: string,
): Promise<DirectKlingResult> {
  const accessKey = process.env.KLING_ACCESS_KEY!;
  const secretKey = process.env.KLING_SECRET_KEY!;
  const token     = generateJWT(accessKey, secretKey);

  const mapping   = FAL_TO_DIRECT[input.falModelId];
  const modelName = mapping?.model_name ?? "kling-v1-6";
  const mode      = mapping?.mode ?? (input.falModelId.includes("pro") ? "pro" : "std");
  const isI2V     = !!input.image_url;
  const endpoint  = isI2V
    ? `${KLING_BASE}/v1/videos/image2video`
    : `${KLING_BASE}/v1/videos/text2video`;
  const pollBase  = isI2V
    ? `${KLING_BASE}/v1/videos/image2video`
    : `${KLING_BASE}/v1/videos/text2video`;

  const headers = {
    Authorization:  `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const body: Record<string, unknown> = {
    model_name:      modelName,
    mode,
    prompt:          input.prompt,
    negative_prompt: input.negative_prompt,
    cfg_scale:       input.cfg_scale,
    duration:        input.duration,
    aspect_ratio:    input.aspect_ratio,
  };
  if (isI2V) body.image = input.image_url;

  const submitRes = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => submitRes.statusText);
    throw new Error(`[kling-direct] ${label} submit failed HTTP ${submitRes.status}: ${errText.slice(0, 200)}`);
  }
  const submitData = await submitRes.json() as { code?: number; message?: string; data?: { task_id?: string } };
  if (submitData.code !== 0 || !submitData.data?.task_id) {
    throw new Error(`[kling-direct] ${label} submit error: ${JSON.stringify(submitData).slice(0, 200)}`);
  }
  const taskId = submitData.data.task_id;
  console.info(`[kling-direct] ${label} submitted taskId=${taskId} model=${modelName} mode=${mode}`);

  // ── Poll ─────────────────────────────────────────────────────────────────────
  const deadline  = Date.now() + timeoutMs;
  const pollDelay = 3_000; // 3s between polls

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, pollDelay));

    // Refresh JWT if close to expiry
    const freshToken  = generateJWT(accessKey, secretKey);
    const pollRes = await fetch(`${pollBase}/${taskId}`, {
      headers: { Authorization: `Bearer ${freshToken}`, "Content-Type": "application/json" },
    });
    if (!pollRes.ok) {
      console.warn(`[kling-direct] ${label} poll HTTP ${pollRes.status} — will retry`);
      continue;
    }
    const pollData = await pollRes.json() as {
      code?: number;
      data?: {
        task_status?: string;
        task_status_msg?: string;
        task_result?: { videos?: Array<{ url?: string }> };
      };
    };

    const status = pollData.data?.task_status;
    if (status === "succeed") {
      const video_url = pollData.data?.task_result?.videos?.[0]?.url;
      if (!video_url) throw new Error(`[kling-direct] ${label} succeed but no video URL`);
      console.info(`[kling-direct] ${label} DONE taskId=${taskId} url=${video_url.slice(0, 60)}`);
      return { video_url, model_used: `direct:${modelName}:${mode}`, mode };
    }
    if (status === "failed") {
      const msg = pollData.data?.task_status_msg ?? "unknown failure";
      throw new Error(`[kling-direct] ${label} task failed: ${msg}`);
    }
    // status: "submitted" | "processing" — keep polling
    console.info(`[kling-direct] ${label} taskId=${taskId} status=${status} — polling...`);
  }

  throw new Error(`[kling-direct] ${label} timed out after ${timeoutMs}ms (taskId=${taskId})`);
}
