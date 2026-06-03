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

  // ── URL integrity log — must appear in logs before ANY fetch ─────────────────
  // If HEDRA_FAILED occurs immediately after this log, root cause is network/DNS.
  // If this log never appears, the call site is the problem.
  const { createHash } = await import("crypto");
  const imageHash = createHash("sha256").update(input.image_url).digest("hex").substring(0, 16);
  const audioHash = createHash("sha256").update(input.audio_url).digest("hex").substring(0, 16);
  console.info("[hedra] pre-submit integrity", {
    api_base:          HEDRA_BASE,
    image_url_length:  input.image_url.length,
    image_url_tail:    input.image_url.slice(-100),
    image_url_hash:    imageHash,
    audio_url_length:  input.audio_url.length,
    audio_url_tail:    input.audio_url.slice(-100),
    audio_url_hash:    audioHash,
  });

  const submitPayload = {
    image_url:  input.image_url,
    audio_url:  input.audio_url,
    resolution: input.resolution ?? "720p",
  };
  const submitBody = JSON.stringify(submitPayload);
  console.info("[hedra] submit payload", {
    payload_bytes:     submitBody.length,
    payload_hash:      createHash("sha256").update(submitBody).digest("hex").substring(0, 16),
  });

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
    console.error("[hedra] submit FAILED", {
      status:   submitRes.status,
      headers:  Object.fromEntries(submitRes.headers.entries()),
      body:     text,  // full body — not truncated
      api_base: HEDRA_BASE,
    });
    throw new Error(`Hedra submit failed HTTP ${submitRes.status}: ${text}`);
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
