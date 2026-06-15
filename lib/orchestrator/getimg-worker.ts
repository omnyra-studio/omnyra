// GetImg image generation worker — Flux Schnell (fast) or Flux Dev (quality).
//
// Used to generate high-quality source frames that feed into i2v pipelines
// (Kling, Runway). Not a video generator — produces still images only.
// REST API, no SDK. GETIMG_API_KEY from env.

import { supabaseAdmin } from "@/lib/supabase/admin";

const GETIMG_BASE = "https://api.getimg.ai/v1";

export interface GetImgInput {
  prompt:           string;
  negativePrompt?:  string;
  width?:           number;  // default 768
  height?:          number;  // default 1344 (9:16 portrait)
  useQualityModel?: boolean; // true → flux-dev (28 steps), false → flux-schnell (4 steps)
}

export interface GetImgResult {
  imageUrl:     string;
  modelUsed:    string;
  generationMs: number;
}

export async function generateGetImgFrame(input: GetImgInput): Promise<GetImgResult> {
  const apiKey = process.env.GETIMG_API_KEY;
  if (!apiKey) throw new Error("[getimg] GETIMG_API_KEY not set — add it to Vercel env vars at dashboard.getimg.ai");

  const model   = input.useQualityModel ? "flux-dev" : "flux-schnell";
  const steps   = input.useQualityModel ? 28 : 4;
  const startMs = Date.now();
  const width   = input.width  ?? 768;
  const height  = input.height ?? 1344;

  const body: Record<string, unknown> = {
    prompt:          input.prompt,
    width,
    height,
    steps,
    output_format:   "jpeg",
    response_format: "url",
  };

  // Flux Dev supports guidance + negative; Schnell does not
  if (input.useQualityModel) {
    body.guidance = 3.5;
    if (input.negativePrompt) body.negative_prompt = input.negativePrompt;
  }

  const res = await fetch(`${GETIMG_BASE}/${model}/text-to-image`, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const hint = res.status === 401
      ? " — GETIMG_API_KEY is invalid or expired. Verify at dashboard.getimg.ai"
      : res.status === 403
      ? " — account lacks access to this model tier"
      : res.status === 429
      ? " — rate limited; reduce request frequency"
      : "";
    throw new Error(`[getimg] ${model} ${res.status}${hint}: ${text.slice(0, 200)}`);
  }

  const data = await res.json() as { url?: string; image?: string };

  let imageUrl: string;

  if (data.url) {
    imageUrl = data.url;
  } else if (data.image) {
    // Base64 response — upload to Supabase for a stable HTTPS URL accessible by fal.ai
    const buf       = Buffer.from(data.image, "base64");
    const path      = `getimg/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const { error } = await supabaseAdmin.storage
      .from("videos")
      .upload(path, buf, { contentType: "image/jpeg", upsert: false });
    if (error) throw new Error(`[getimg] storage upload failed: ${error.message}`);
    imageUrl = supabaseAdmin.storage.from("videos").getPublicUrl(path).data.publicUrl;
  } else {
    throw new Error("[getimg] no image in response");
  }

  const generationMs = Date.now() - startMs;
  console.info(`[GETIMG] model=${model} ${width}×${height} ms=${generationMs} url=${imageUrl.slice(0, 60)}`);

  return { imageUrl, modelUsed: model, generationMs };
}
