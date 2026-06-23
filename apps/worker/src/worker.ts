/**
 * @omnyra/worker — entry point
 *
 * Starts all queue workers. Deploy as a persistent process (Railway / Fly.io).
 * NOT a Vercel serverless function — needs a long-running Node process.
 *
 * Workers started:
 *   - scene-render     (concurrency=3)
 *   - scene-priority   (concurrency=2)
 *
 * Environment variables required:
 *   REDIS_URL, KLING_API_KEY, RUNWAY_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { Worker, type Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import type { SceneRenderJob } from "./queues/scene-render.queue";
import { processRenderJob } from "./processors/render.processor";

// ── Redis connection ───────────────────────────────────────────────────────────

function buildRedisConnection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL env var required");
  const parsed = new URL(url);
  return {
    host:     parsed.hostname,
    port:     Number(parsed.port) || 6379,
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    tls:      parsed.protocol === "rediss:" ? {} : undefined,
  };
}

// ── Supabase (for storing render results) ─────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);

async function storeResult(
  projectId: string,
  sceneId:   string,
  videoUrl:  string,
  model:     string,
  renderMs:  number,
): Promise<void> {
  await supabase.from("scenes").update({
    video_url:     videoUrl,
    render_status: "complete",
    model_used:    model,
    render_ms:     renderMs,
  }).eq("project_id", projectId).eq("scene_id", sceneId);
}

// ── Worker factory ─────────────────────────────────────────────────────────────

function startWorker(queueName: string, concurrency: number) {
  const connection = buildRedisConnection();

  const worker = new Worker<SceneRenderJob>(
    queueName,
    async (job: Job<SceneRenderJob>) => {
      const result = await processRenderJob(job);

      await storeResult(
        job.data.projectId,
        job.data.sceneId,
        result.videoUrl,
        result.model,
        result.renderMs,
      );

      return result;
    },
    { connection, concurrency },
  );

  worker.on("completed", job => {
    console.log(`[${queueName.toUpperCase()}] job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[${queueName.toUpperCase()}] job ${job?.id} failed: ${err.message}`);
    if (job?.data) {
      void supabase.from("scenes").update({
        render_status: "failed",
        error_message: err.message.slice(0, 500),
      }).eq("project_id", job.data.projectId).eq("scene_id", job.data.sceneId);
    }
  });

  worker.on("error", err => {
    console.error(`[${queueName.toUpperCase()}] worker error: ${err.message}`);
  });

  console.log(`[WORKER] ${queueName} started (concurrency=${concurrency})`);
  return worker;
}

// ── Main ───────────────────────────────────────────────────────────────────────

function main() {
  console.log("[WORKER] Omnyra render worker starting...");
  console.log(`[WORKER] NODE_ENV=${process.env.NODE_ENV}`);

  const renderWorker   = startWorker("scene-render",    3);
  const priorityWorker = startWorker("scene-priority",  2);

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    console.log("[WORKER] SIGTERM received — draining queues...");
    await Promise.all([renderWorker.close(), priorityWorker.close()]);
    console.log("[WORKER] shutdown complete");
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("[WORKER] SIGINT received — shutting down...");
    await Promise.all([renderWorker.close(), priorityWorker.close()]);
    process.exit(0);
  });
}

main();
