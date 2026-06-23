/**
 * Kling v2.1 client — image-to-video.
 * Stateless — all config injected. Safe to run in parallel workers.
 */

export interface KlingRenderParams {
  imageUrl:       string;
  prompt:         string;
  negativePrompt: string;
  durationSecs:   number;
  aspectRatio:    string;
}

export interface KlingRenderResult {
  videoUrl:  string;
  taskId:    string;
  renderMs:  number;
}

export async function renderWithKling(
  params:  KlingRenderParams,
  apiKey:  string,
): Promise<KlingRenderResult> {
  const t0 = Date.now();

  const startRes = await fetch("https://api.klingai.com/v1/videos/image2video", {
    method:  "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model_name:      "kling-v2-1",
      mode:            "pro",
      image_url:       params.imageUrl,
      prompt:          params.prompt,
      negative_prompt: params.negativePrompt,
      duration:        String(params.durationSecs),
      aspect_ratio:    params.aspectRatio,
      cfg_scale:       0.5,
    }),
  });

  const startData = await startRes.json() as { data?: { task_id?: string }; code?: number; message?: string };
  if (startData.code !== 0 || !startData.data?.task_id) {
    throw new Error(`Kling start failed: ${startData.message ?? JSON.stringify(startData)}`);
  }

  const taskId = startData.data.task_id;

  // Poll until complete (max 5 min)
  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(5000);

    const pollRes  = await fetch(`https://api.klingai.com/v1/videos/image2video/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const pollData = await pollRes.json() as {
      data?: { task_status?: string; task_result?: { videos?: Array<{ url: string }> } };
    };

    const status = pollData.data?.task_status;
    if (status === "succeed") {
      const url = pollData.data?.task_result?.videos?.[0]?.url;
      if (!url) throw new Error("Kling succeeded but returned no video URL");
      return { videoUrl: url, taskId, renderMs: Date.now() - t0 };
    }
    if (status === "failed") throw new Error(`Kling task ${taskId} failed`);
  }

  throw new Error(`Kling task ${taskId} timed out after 5 minutes`);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
