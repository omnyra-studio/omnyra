/**
 * Scene Render Worker
 *
 * Picks jobs from scene-render and scene-priority queues.
 * Executes the actual Kling / Runway render call.
 * Stores result in Supabase `renders` table.
 * Emits cost analysis job after each completed render.
 *
 * NOTE: This file is imported by a long-running Node process (not Vercel serverless).
 * In production, deploy as a Railway / Fly.io worker separate from the Next.js app.
 */

import { Worker, type Job } from "bullmq";
import type { SceneRenderJob, DriftRepairJob, StitchJob } from "./queues";
import { getCostAnalysisQueue } from "./queues";

// ── Kling Render (existing API wrapper, reused from route) ─────────────────────
async function renderWithKling(job: SceneRenderJob): Promise<string> {
  const apiKey = process.env.KLING_API_KEY;
  if (!apiKey) throw new Error("KLING_API_KEY not set");

  const startRes = await fetch("https://api.klingai.com/v1/videos/image2video", {
    method:  "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model_name:     "kling-v2-1",
      mode:           "pro",
      image_url:      job.image_url,
      prompt:         job.video_prompt,
      negative_prompt: job.negative_prompt,
      duration:       String(job.duration_secs),
      aspect_ratio:   job.aspect_ratio,
      cfg_scale:      0.5,
    }),
  });

  const startData = await startRes.json() as { data?: { task_id?: string }; code?: number; message?: string };
  if (startData.code !== 0 || !startData.data?.task_id) {
    throw new Error(`Kling start failed: ${startData.message ?? "unknown"}`);
  }

  const taskId = startData.data.task_id;

  // Poll until complete (up to 5 minutes)
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise(r => setTimeout(r, 5000));

    const pollRes  = await fetch(`https://api.klingai.com/v1/videos/image2video/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const pollData = await pollRes.json() as {
      data?: { task_status?: string; task_result?: { videos?: Array<{ url: string }> } };
    };

    const status = pollData.data?.task_status;
    if (status === "succeed") {
      const url = pollData.data?.task_result?.videos?.[0]?.url;
      if (!url) throw new Error("Kling: succeeded but no video URL");
      return url;
    }
    if (status === "failed") throw new Error("Kling: render failed");
  }

  throw new Error("Kling: render timed out after 5 minutes");
}

// ── Supabase Result Storage ────────────────────────────────────────────────────
async function storeRenderResult(
  projectId: string,
  sceneId: string,
  videoUrl: string,
  model: string,
  renderMs: number,
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;   // silently skip in dev without DB

  await fetch(`${supabaseUrl}/rest/v1/renders`, {
    method:  "POST",
    headers: {
      apikey:          serviceKey,
      Authorization:   `Bearer ${serviceKey}`,
      "Content-Type":  "application/json",
      Prefer:          "return=minimal",
    },
    body: JSON.stringify({
      project_id: projectId,
      scene_id:   sceneId,
      video_url:  videoUrl,
      model,
      render_ms:  renderMs,
      status:     "complete",
    }),
  });
}

// ── Worker Factory ─────────────────────────────────────────────────────────────
const REDIS_CONN = {
  host:     process.env.REDIS_HOST ?? "localhost",
  port:     Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
  tls:      process.env.REDIS_TLS === "true" ? {} : undefined,
};

export function startSceneRenderWorker(concurrency = 3) {
  const worker = new Worker<SceneRenderJob>(
    "scene-render",
    async (job: Job<SceneRenderJob>) => {
      const t0   = Date.now();
      const data = job.data;
      console.log(`[WORKER] rendering scene=${data.scene_id} model=${data.model}`);

      let videoUrl: string;
      if (data.model === "kling") {
        videoUrl = await renderWithKling(data);
      } else {
        // Runway/Luma — extend here when integrations are added
        throw new Error(`Model ${data.model} worker not yet implemented`);
      }

      const renderMs = Date.now() - t0;
      await storeRenderResult(data.project_id, data.scene_id, videoUrl, data.model, renderMs);

      // Fire cost analysis
      await getCostAnalysisQueue().add("cost", {
        project_id: data.project_id,
        scene_id:   data.scene_id,
        model:      data.model,
        cost_usd:   data.model === "kling" ? 0.08 : data.model === "runway" ? 0.25 : 0.15,
        render_ms:  renderMs,
      });

      console.log(`[WORKER] done scene=${data.scene_id} in ${renderMs}ms → ${videoUrl}`);
      return { videoUrl, renderMs };
    },
    { connection: REDIS_CONN, concurrency },
  );

  worker.on("failed", (job, err) => {
    console.error(`[WORKER] job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}

export function startScenePriorityWorker(concurrency = 2) {
  const worker = new Worker<SceneRenderJob>(
    "scene-priority",
    async (job: Job<SceneRenderJob>) => {
      const t0     = Date.now();
      const data   = job.data;
      console.log(`[PRIORITY-WORKER] rendering climax scene=${data.scene_id}`);
      const videoUrl = await renderWithKling(data);
      const renderMs = Date.now() - t0;
      await storeRenderResult(data.project_id, data.scene_id, videoUrl, data.model, renderMs);
      return { videoUrl, renderMs };
    },
    { connection: REDIS_CONN, concurrency },
  );

  return worker;
}

export function startDriftRepairWorker() {
  return new Worker<DriftRepairJob>(
    "drift-repair",
    async (job: Job<DriftRepairJob>) => {
      console.log(`[DRIFT-WORKER] repairing scene=${job.data.scene_id} reason=${job.data.reason}`);
      // Drift repair regenerates the image only (Flux Dev re-run with brand memory injection)
      // Full implementation connects back to generate-scene-images pipeline
    },
    { connection: REDIS_CONN, concurrency: 1 },
  );
}

export function startStitchWorker() {
  return new Worker<StitchJob>(
    "stitch",
    async (job: Job<StitchJob>) => {
      console.log(`[STITCH-WORKER] stitching ${job.data.clip_urls.length} clips for project=${job.data.project_id}`);
      // Final video assembly — ffmpeg or a serverless stitching service
      // Placeholder: update DB with final video URL when stitching is implemented
    },
    { connection: REDIS_CONN, concurrency: 1 },
  );
}
