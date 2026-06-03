// Hedra direct API provider — thin HTTP client only.
//
// Asset validation and URL resolution happen in the caller before this is invoked.
// This module makes no decisions; it submits, polls, and returns.
//
// Env var: HEDRA_API_KEY

const HEDRA_BASE = "https://api.hedra.ai/v1";
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 72; // 6 min

export interface HedraInput {
  image_url:   string;
  audio_url:   string;
  resolution?: "720p" | "1080p";
}

export interface HedraOutput {
  video_url:  string;
  request_id: string;
}

export async function generateHedraAvatar(input: HedraInput): Promise<HedraOutput> {
  const apiKey = process.env.HEDRA_API_KEY;
  if (!apiKey) throw new Error("HEDRA_API_KEY not configured");

  // Submit generation
  const submitRes = await fetch(`${HEDRA_BASE}/generate`, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      image_url:  input.image_url,
      audio_url:  input.audio_url,
      resolution: input.resolution ?? "720p",
    }),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text().catch(() => "");
    throw new Error(`Hedra submit failed HTTP ${submitRes.status}: ${text.substring(0, 300)}`);
  }

  const job = await submitRes.json() as { id?: string; job_id?: string };
  const jobId = job.id ?? job.job_id;
  if (!jobId) throw new Error(`Hedra submit returned no job id: ${JSON.stringify(job).substring(0, 200)}`);

  console.info(`[hedra] job submitted id=${jobId}`);

  // Poll
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const statusRes = await fetch(`${HEDRA_BASE}/status/${jobId}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });

    if (!statusRes.ok) {
      console.warn(`[hedra] poll ${i + 1} HTTP ${statusRes.status} — retrying`);
      continue;
    }

    const data = await statusRes.json() as {
      status:      string;
      output_url?: string;
      video_url?:  string;
      url?:        string;
    };

    console.info(`[hedra] poll ${i + 1} status=${data.status}`);

    if (data.status === "completed" || data.status === "Completed") {
      const url = data.output_url ?? data.video_url ?? data.url;
      if (!url) throw new Error(`Hedra completed but no video URL in response: ${JSON.stringify(data).substring(0, 200)}`);
      return { video_url: url, request_id: jobId };
    }

    if (data.status === "failed" || data.status === "Failed" || data.status === "error") {
      throw new Error(`Hedra job ${jobId} failed: ${JSON.stringify(data).substring(0, 200)}`);
    }
  }

  throw new Error(`Hedra job ${jobId} timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`);
}
