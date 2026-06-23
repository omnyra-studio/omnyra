import type { Job } from "bullmq";
import type { SceneRenderJob } from "../queues/scene-render.queue";
import { renderWithKling } from "../engines/kling.client";
import { renderWithRunway } from "../engines/runway.client";

export interface RenderResult {
  videoUrl:  string;
  renderMs:  number;
  model:     string;
}

/**
 * Core render processor.
 * Routes to Kling or Runway based on job.data.model.
 * Stateless — all state lives in the job payload and snapshot.
 */
export async function processRenderJob(job: Job<SceneRenderJob>): Promise<RenderResult> {
  const d = job.data;
  const label = `[RENDER scene=${d.sceneId} model=${d.model}]`;
  console.log(`${label} starting`);

  switch (d.model) {
    case "kling": {
      const apiKey = process.env.KLING_API_KEY;
      if (!apiKey) throw new Error("KLING_API_KEY not set");
      const result = await renderWithKling({
        imageUrl:       d.imageUrl,
        prompt:         d.videoPrompt,
        negativePrompt: d.negativePrompt,
        durationSecs:   d.durationSecs,
        aspectRatio:    d.aspectRatio,
      }, apiKey);
      console.log(`${label} done ${result.renderMs}ms → ${result.videoUrl.slice(0, 80)}`);
      return { videoUrl: result.videoUrl, renderMs: result.renderMs, model: "kling" };
    }

    case "runway": {
      const apiKey = process.env.RUNWAY_API_KEY;
      if (!apiKey) throw new Error("RUNWAY_API_KEY not set");
      const ratioMap: Record<string, "720:1280" | "1280:720"> = { "9:16": "720:1280", "16:9": "1280:720" };
      const result = await renderWithRunway({
        imageUrl:  d.imageUrl,
        prompt:    d.videoPrompt,
        ratio:     ratioMap[d.aspectRatio] ?? "720:1280",
        duration:  d.durationSecs > 5 ? 10 : 5,
      }, apiKey);
      console.log(`${label} done ${result.renderMs}ms → ${result.videoUrl.slice(0, 80)}`);
      return { videoUrl: result.videoUrl, renderMs: result.renderMs, model: "runway" };
    }

    default:
      throw new Error(`Unknown model: ${d.model}`);
  }
}
