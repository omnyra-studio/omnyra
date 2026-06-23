/**
 * Runway Gen-4 Turbo client.
 * Uses the standard Runway API — imageToVideo endpoint.
 */

export interface RunwayRenderParams {
  imageUrl:    string;
  prompt:      string;
  ratio:       string;    // "720:1280" | "1280:720"
  duration:    5 | 10;
}

export interface RunwayRenderResult {
  videoUrl:  string;
  taskId:    string;
  renderMs:  number;
}

export async function renderWithRunway(
  params:  RunwayRenderParams,
  apiKey:  string,
): Promise<RunwayRenderResult> {
  const t0 = Date.now();

  // Submit generation
  const submitRes = await fetch("https://api.dev.runwayml.com/v1/image_to_video", {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Runway-Version": "2024-11-06",
    },
    body: JSON.stringify({
      promptImage: params.imageUrl,
      promptText:  params.prompt,
      model:       "gen4_turbo",
      duration:    params.duration,
      ratio:       params.ratio,
      watermark:   false,
    }),
  });

  const submitData = await submitRes.json() as { id?: string; error?: string };
  if (!submitData.id) {
    throw new Error(`Runway submit failed: ${submitData.error ?? JSON.stringify(submitData)}`);
  }

  const taskId = submitData.id;

  // Poll
  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(5000);

    const pollRes  = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, "X-Runway-Version": "2024-11-06" },
    });
    const pollData = await pollRes.json() as { status?: string; output?: string[]; error?: string };

    if (pollData.status === "SUCCEEDED" && pollData.output?.[0]) {
      return { videoUrl: pollData.output[0], taskId, renderMs: Date.now() - t0 };
    }
    if (pollData.status === "FAILED") {
      throw new Error(`Runway task ${taskId} failed: ${pollData.error ?? "unknown"}`);
    }
  }

  throw new Error(`Runway task ${taskId} timed out`);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
