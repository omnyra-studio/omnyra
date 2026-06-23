/**
 * BullMQ Queue Definitions
 *
 * Five queues, each with a distinct concern:
 *   scene-render       — main render jobs (image → video via Kling/Runway)
 *   scene-priority     — climax scenes fast-tracked ahead of queue
 *   drift-repair       — character drift correction rerenders
 *   stitch             — final assembly of rendered clips into one video
 *   cost-analysis      — async cost ledger writes (fire-and-forget)
 *
 * Connection: reads REDIS_URL from env (Upstash / Railway / local).
 * All queues share the same connection config.
 */

import { Queue, type ConnectionOptions } from "bullmq";

// ── Connection ─────────────────────────────────────────────────────────────────
function getRedisConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL env var is required for queue system");

  // Upstash REST URLs are not socket — use ioredis-compatible format
  try {
    const parsed = new URL(url);
    return {
      host:     parsed.hostname,
      port:     Number(parsed.port) || 6379,
      password: parsed.password || undefined,
      username: parsed.username || undefined,
      tls:      parsed.protocol === "rediss:" ? {} : undefined,
    };
  } catch {
    throw new Error(`Invalid REDIS_URL: ${url}`);
  }
}

// ── Queue Data Types ───────────────────────────────────────────────────────────
export interface SceneRenderJob {
  project_id:        string;
  scene_id:          string;
  image_url:         string;    // Flux Dev output — used as i2v reference
  video_prompt:      string;
  negative_prompt:   string;
  duration_secs:     number;
  model:             "kling" | "runway" | "luma";
  aspect_ratio:      string;
  narrative_role:    "hook" | "development" | "climax" | "resolution";
  motion_complexity: "low" | "medium" | "high";
  priority:          number;
  attempt:           number;
}

export interface DriftRepairJob {
  project_id:  string;
  scene_id:    string;
  image_url:   string;
  reason:      string;   // "face_drift" | "outfit_change" | "lighting_override"
}

export interface StitchJob {
  project_id:  string;
  clip_urls:   string[];   // ordered list of rendered clip URLs
  output_path: string;
  aspect_ratio: string;
}

export interface CostAnalysisJob {
  project_id:  string;
  scene_id:    string;
  model:       string;
  cost_usd:    number;
  render_ms:   number;
}

// ── Queue Instances ────────────────────────────────────────────────────────────
let _connection: ConnectionOptions | null = null;

function connection(): ConnectionOptions {
  if (!_connection) _connection = getRedisConnection();
  return _connection;
}

export function getSceneRenderQueue() {
  return new Queue<SceneRenderJob>("scene-render", {
    connection: connection(),
    defaultJobOptions: {
      attempts:    3,
      backoff:     { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail:     { count: 200 },
    },
  });
}

export function getScenePriorityQueue() {
  return new Queue<SceneRenderJob>("scene-priority", {
    connection: connection(),
    defaultJobOptions: {
      attempts: 3,
      priority: 1,    // BullMQ: lower number = higher priority
      backoff:  { type: "exponential", delay: 3000 },
      removeOnComplete: { count: 50 },
      removeOnFail:     { count: 100 },
    },
  });
}

export function getDriftRepairQueue() {
  return new Queue<DriftRepairJob>("drift-repair", {
    connection: connection(),
    defaultJobOptions: {
      attempts: 2,
      backoff:  { type: "fixed", delay: 2000 },
      removeOnComplete: { count: 50 },
    },
  });
}

export function getStitchQueue() {
  return new Queue<StitchJob>("stitch", {
    connection: connection(),
    defaultJobOptions: {
      attempts: 2,
      backoff:  { type: "fixed", delay: 10000 },
      removeOnComplete: { count: 50 },
      removeOnFail:     { count: 100 },
    },
  });
}

export function getCostAnalysisQueue() {
  return new Queue<CostAnalysisJob>("cost-analysis", {
    connection: connection(),
    defaultJobOptions: {
      attempts: 1,              // fire-and-forget: no retry for ledger writes
      removeOnComplete: { count: 500 },
    },
  });
}

/** Push a scene render job to the appropriate queue based on priority */
export async function enqueueSceneRender(job: SceneRenderJob): Promise<string> {
  const queue = job.priority === 1 ? getScenePriorityQueue() : getSceneRenderQueue();
  const result = await queue.add(`render:${job.scene_id}`, job, {
    priority: job.priority,
  });
  return result.id ?? job.scene_id;
}
