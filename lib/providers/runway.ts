/**
 * Runway Gen-4 Turbo text-to-video provider.
 * Used as fallback when ElevenLabs Seedance is unavailable.
 *
 * Pricing: ~$0.05/s at 720p — 5s clip ≈ $0.25
 * API docs: https://docs.runwayml.com/reference/posttaskstext_to_video
 */

const RUNWAY_BASE = "https://api.runwayml.com/v1";
const RUNWAY_VERSION_HEADER = "2024-11-06";

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_MS      = 240_000;

export interface RunwayT2VParams {
  prompt: string;
  duration?: 5 | 10;
  /** Runway ratio string — use "768:1344" for 9:16 vertical video */
  ratio?: string;
  seed?: number;
}

export interface RunwayT2VResult {
  url: string;
  taskId: string;
  generationMs: number;
}

function getApiKey(): string {
  const key = process.env.RUNWAY_API_KEY ?? "";
  if (!key) throw new Error("RUNWAY_API_KEY not configured");
  return key;
}

function runwayHeaders(apiKey: string): Record<string, string> {
  return {
    "Authorization":    `Bearer ${apiKey}`,
    "X-Runway-Version": RUNWAY_VERSION_HEADER,
    "Content-Type":     "application/json",
  };
}

async function pollTask(apiKey: string, taskId: string, startMs: number): Promise<string> {
  const deadline = startMs + MAX_POLL_MS;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(`${RUNWAY_BASE}/tasks/${taskId}`, {
      headers: runwayHeaders(apiKey),
    });

    if (!res.ok) {
      console.warn(`[RUNWAY_POLL] HTTP ${res.status} — retrying`);
      continue;
    }

    const body = await res.json() as Record<string, unknown>;
    const status = String(body.status ?? "").toUpperCase();
    console.log(`[RUNWAY_POLL] id=${taskId} status=${status}`);

    if (status === "FAILED") {
      const reason = body.failure ?? body.failureCode ?? "unknown";
      throw new Error(`Runway task failed: ${reason}`);
    }

    if (status === "SUCCEEDED") {
      const output = body.output as string[] | undefined;
      const url = output?.[0];
      if (!url) throw new Error("Runway succeeded but output is empty");
      return url;
    }
    // PENDING / RUNNING / THROTTLED — keep polling
  }

  throw new Error("Runway generation timed out after 4 minutes");
}

export async function callRunwayT2V(params: RunwayT2VParams): Promise<RunwayT2VResult> {
  const apiKey  = getApiKey();
  const startMs = Date.now();
  const duration = params.duration ?? 5;
  const ratio    = params.ratio ?? "768:1344"; // 9:16 vertical

  console.log(`[RUNWAY_T2V] model=gen4_turbo duration=${duration}s ratio=${ratio}`);

  const res = await fetch(`${RUNWAY_BASE}/text_to_video`, {
    method:  "POST",
    headers: runwayHeaders(apiKey),
    body: JSON.stringify({
      model:      "gen4_turbo",
      promptText: params.prompt,
      duration,
      ratio,
      ...(params.seed !== undefined ? { seed: params.seed } : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Runway T2V HTTP ${res.status} — ${errText.substring(0, 300)}`);
  }

  const data = await res.json() as Record<string, unknown>;
  const taskId = String(data.id ?? data.taskId ?? "");
  if (!taskId) throw new Error(`Runway returned no task id — ${JSON.stringify(data).substring(0, 200)}`);

  console.log(`[RUNWAY_T2V_QUEUED] taskId=${taskId}`);
  const url = await pollTask(apiKey, taskId, startMs);

  const generationMs = Date.now() - startMs;
  console.log(`[RUNWAY_T2V_OK] ms=${generationMs} url=${url.substring(0, 80)}`);

  return { url, taskId, generationMs };
}
