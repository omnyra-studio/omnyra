/**
 * Queue abstraction for the orchestration worker system.
 *
 * The interface is intentionally minimal so the backend is swappable:
 *   - FireAndForgetQueue (default)  — HTTP POST to worker API routes, no await
 *   - DirectQueue                   — calls worker functions in-process (tests / dev)
 *   - BullMQ / Vercel Queues / QStash adapters can be dropped in later
 *
 * Select queue at startup via WORKER_QUEUE env var:
 *   "http"   → FireAndForgetQueue (production, requires WORKER_BASE_URL + WORKER_SECRET)
 *   "direct" → DirectQueue (development, no infrastructure needed)
 *   default  → FireAndForgetQueue if WORKER_BASE_URL is set, else DirectQueue
 */

import type { WorkerJob } from "./types";

// ── Interface ──────────────────────────────────────────────────────────────────

export interface JobQueue {
  enqueue(job: WorkerJob): Promise<void>;
  /** Enqueue multiple jobs, returning after all are submitted (not processed). */
  enqueueAll(jobs: WorkerJob[]): Promise<void>;
}

// ── Fire-and-forget HTTP queue ─────────────────────────────────────────────────
// POSTs to worker API routes; does NOT await the response body.
// Suitable for production Vercel deployment: each job becomes a separate
// serverless function invocation triggered by the HTTP call.

const ROUTE_MAP: Record<WorkerJob["type"], string> = {
  render_shot:         "/api/workers/shot",
  generate_voiceover:  "/api/workers/voiceover",
  compose_video:       "/api/workers/composition",
  render_shard:        "/api/workers/shard",
};

export class FireAndForgetQueue implements JobQueue {
  constructor(
    private baseUrl: string,
    private secret:  string,
  ) {}

  async enqueue(job: WorkerJob): Promise<void> {
    const path = ROUTE_MAP[job.type];
    const url  = `${this.baseUrl}${path}`;
    // Deliberately fire-and-forget — orchestrateProject() returns before workers complete
    fetch(url, {
      method:  "POST",
      headers: {
        "Content-Type":    "application/json",
        "X-Worker-Secret": this.secret,
      },
      body: JSON.stringify(job),
    }).catch(err => console.error(`[queue] enqueue failed for ${job.type}:`, err));
  }

  async enqueueAll(jobs: WorkerJob[]): Promise<void> {
    await Promise.all(jobs.map(j => this.enqueue(j)));
  }
}

// ── Direct (in-process) queue ─────────────────────────────────────────────────
// Calls worker functions synchronously. Useful for local dev without
// worker infrastructure — turns async pipeline into blocking sequential execution.

export class DirectQueue implements JobQueue {
  async enqueue(job: WorkerJob): Promise<void> {
    // Dynamically import to avoid circular deps — workers import queue too
    const { dispatchWorkerJob } = await import("./dispatch");
    await dispatchWorkerJob(job);
  }

  async enqueueAll(jobs: WorkerJob[]): Promise<void> {
    // Run in parallel — each worker is independent
    await Promise.allSettled(jobs.map(j => this.enqueue(j)));
  }
}

// ── Factory ────────────────────────────────────────────────────────────────────

let _queue: JobQueue | null = null;

export function getQueue(): JobQueue {
  if (_queue) return _queue;

  const mode    = process.env.WORKER_QUEUE ?? "auto";
  const baseUrl = process.env.WORKER_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const secret  = process.env.WORKER_SECRET ?? "";

  if (mode === "direct" || (mode === "auto" && !baseUrl)) {
    _queue = new DirectQueue();
  } else {
    _queue = new FireAndForgetQueue(baseUrl, secret);
  }

  return _queue;
}
