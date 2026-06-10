// Runway Gen-4 Turbo video generation worker.
//
// REST API, no SDK. RUNWAY_API_KEY from env.
// Gen-4 Turbo is always i2v — requires a source image (promptImage).
// Submit task → poll GET /tasks/{id} until SUCCEEDED or FAILED.
// Timeout: 180s (Runway typically completes in 60–120s).

const RUNWAY_BASE    = "https://api.runwayml.com/v1";
const RUNWAY_VERSION = "2024-11-06";
const RUNWAY_MODEL   = "gen4_turbo";

export interface RunwayWorkerInput {
  shotId:       string;
  shotNumber:   number;
  prompt:       string;
  imageUrl:     string;   // required — Gen-4 is i2v only
  durationSecs?: number;  // 5 or 10; default 5
  aspectRatio?:  string;  // "9:16" | "16:9" | "1:1"
  speedMode?:   string;
}

export interface RunwayWorkerResult {
  shotId:           string;
  shotNumber:       number;
  video_url:        string;
  duration_seconds: number;
  model_used:       string;
  generation_ms:    number;
}

function toRunwayRatio(ar?: string): string {
  if (ar === "16:9") return "1280:768";
  if (ar === "1:1")  return "1024:1024";
  return "768:1280";  // default 9:16 portrait
}

function clampDuration(secs?: number): 5 | 10 {
  return !secs || secs <= 7 ? 5 : 10;
}

interface RunwayTaskResponse {
  id:        string;
  status:    "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  output?:   string[];
  progress?: number;
  failure?:  string;
}

export async function generateRunwayClip(input: RunwayWorkerInput): Promise<RunwayWorkerResult> {
  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) throw new Error("[runway] RUNWAY_API_KEY not set");

  if (!input.imageUrl?.startsWith("https://")) {
    throw new Error(`[runway] imageUrl must be an HTTPS URL — got: ${input.imageUrl?.slice(0, 60)}`);
  }

  const startMs  = Date.now();
  const duration = clampDuration(input.durationSecs);
  const ratio    = toRunwayRatio(input.aspectRatio);

  const headers: Record<string, string> = {
    "Authorization":    `Bearer ${apiKey}`,
    "Content-Type":     "application/json",
    "X-Runway-Version": RUNWAY_VERSION,
  };

  // Submit
  const submitRes = await fetch(`${RUNWAY_BASE}/image_to_video`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model:       RUNWAY_MODEL,
      promptImage: input.imageUrl,
      promptText:  input.prompt,
      duration,
      ratio,
    }),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text().catch(() => "");
    throw new Error(`[runway] submit failed ${submitRes.status}: ${text.slice(0, 200)}`);
  }

  const { id: taskId } = await submitRes.json() as { id?: string };
  if (!taskId) throw new Error("[runway] no task ID in submit response");

  console.info(`[RUNWAY] submitted shot=${input.shotId} taskId=${taskId} model=${RUNWAY_MODEL} duration=${duration}s ratio=${ratio}`);

  // Poll
  const timeoutMs  = 180_000;
  const intervalMs = 5_000;
  const maxPolls   = Math.ceil(timeoutMs / intervalMs);

  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, intervalMs));

    let task: RunwayTaskResponse;
    try {
      const pollRes = await fetch(`${RUNWAY_BASE}/tasks/${taskId}`, { headers });
      if (!pollRes.ok) {
        console.warn(`[RUNWAY_POLL] shot=${input.shotId} poll=${i + 1} HTTP ${pollRes.status} — retrying`);
        continue;
      }
      task = await pollRes.json() as RunwayTaskResponse;
    } catch (err) {
      console.warn(`[RUNWAY_POLL] shot=${input.shotId} poll=${i + 1} fetch error — retrying:`, err);
      continue;
    }

    if (i % 4 === 0) {
      console.info(`[RUNWAY_POLL] shot=${input.shotId} poll=${i + 1}/${maxPolls} status=${task.status} progress=${((task.progress ?? 0) * 100).toFixed(0)}%`);
    }

    if (task.status === "SUCCEEDED") {
      const video_url = task.output?.[0];
      if (!video_url) throw new Error(`[runway] SUCCEEDED but no output URL — shot=${input.shotId}`);
      const generation_ms = Date.now() - startMs;
      console.info(`[RUNWAY_TIMING] shot=${input.shotId} polls=${i + 1} ms=${generation_ms}`);
      return {
        shotId:           input.shotId,
        shotNumber:       input.shotNumber,
        video_url,
        duration_seconds: duration,
        model_used:       RUNWAY_MODEL,
        generation_ms,
      };
    }

    if (task.status === "FAILED" || task.status === "CANCELLED") {
      throw new Error(
        `[runway] task ${task.status} — shot=${input.shotId} taskId=${taskId}: ${task.failure ?? "unknown reason"}`,
      );
    }
  }

  throw new Error(
    `[runway] shot=${input.shotId} timed out after ${timeoutMs / 1000}s (${maxPolls} polls × ${intervalMs / 1000}s)`,
  );
}
