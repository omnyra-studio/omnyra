function cleanEnv(value?: string): string | undefined {
  return value?.replace(/^﻿/, "").trim();
}

export async function GET() {
  const rawBase  = process.env.HEDRA_API_BASE ?? "https://api.hedra.com/web-app/public";
  const rawKey   = process.env.HEDRA_API_KEY  ?? "";
  const apiBase  = cleanEnv(rawBase)!;
  const apiKey   = cleanEnv(rawKey) ?? "";

  const baseFirstCode = apiBase.charCodeAt(0);
  const keyFirstCode  = apiKey.charCodeAt(0);
  const baseOk  = baseFirstCode === 104 && apiBase.startsWith("https://");
  const keyOk   = apiKey.length > 10;

  if (!baseOk || !keyOk) {
    return Response.json({
      error:            "env_validation_failed",
      api_base:         apiBase,
      first_char_code:  baseFirstCode,
      base_ok:          baseOk,
      key_length:       apiKey.length,
      key_first_code:   keyFirstCode,
      key_ok:           keyOk,
      sanitized:        true,
    });
  }

  const base    = apiBase.replace(/\/$/, "");
  const headers = { "X-API-Key": apiKey, "Content-Type": "application/json" };

  // ── 1. Models ─────────────────────────────────────────────────────────────────
  let models_status: number | string = "fetch_threw";
  let models_response = "";
  try {
    const r = await fetch(`${base}/models`, { headers, signal: AbortSignal.timeout(15_000) });
    models_status   = r.status;
    models_response = (await r.text()).substring(0, 2000);
  } catch (e) {
    models_response = String(e);
  }

  // ── 2. Generation probe (expects 422 missing-fields, not 401 auth fail) ───────
  let gen_status: number | string = "fetch_threw";
  let gen_response = "";
  try {
    const r = await fetch(`${base}/generations`, {
      method:  "POST",
      headers,
      body:    JSON.stringify({
        type:        "video",
        ai_model_id: "26f0fc66-152b-40ab-abed-76c43df99bc8",
        generated_video_inputs: { text_prompt: "probe" },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    gen_status   = r.status;
    gen_response = (await r.text()).substring(0, 800);
  } catch (e) {
    gen_response = String(e);
  }

  return Response.json({
    api_base:         apiBase,
    first_char_code:  baseFirstCode,
    sanitized:        true,
    key_length:       apiKey.length,
    key_prefix:       apiKey.substring(0, 12),
    key_first_code:   keyFirstCode,
    models_status,
    models_response,
    gen_status,
    gen_response,
  });
}
