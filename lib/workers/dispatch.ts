/**
 * Worker dispatch — routes a WorkerJob to the correct worker function.
 * Used by DirectQueue (in-process execution) and by worker API routes.
 */

import type { WorkerJob, WorkerResult } from "./types";

export async function dispatchWorkerJob(job: WorkerJob): Promise<WorkerResult> {
  switch (job.type) {
    case "render_shot": {
      const { processShotJob } = await import("./shot-worker");
      return processShotJob(job);
    }
    case "generate_voiceover": {
      const { processVoiceoverJob } = await import("./voiceover-worker");
      return processVoiceoverJob(job);
    }
    case "compose_video": {
      const { processCompositionJob } = await import("./composition-worker");
      return processCompositionJob(job);
    }
    default: {
      const t = (job as WorkerJob).type;
      return { success: false, error: `Unknown job type: ${t}` };
    }
  }
}
