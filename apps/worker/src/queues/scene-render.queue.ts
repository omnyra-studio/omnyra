import { Queue, type ConnectionOptions } from "bullmq";

export interface SceneRenderJob {
  projectId:        string;
  sceneId:          string;
  sceneIndex:       number;
  narrativeRole:    "hook" | "development" | "climax" | "resolution";
  imageUrl:         string;
  videoPrompt:      string;
  negativePrompt:   string;
  durationSecs:     number;
  model:            "kling" | "runway" | "luma";
  aspectRatio:      string;
  motionComplexity: "low" | "medium" | "high";
  priority:         number;
  attempt:          number;
  // Snapshot serialized for continuity tracking
  snapshotJson?:    string;
}

export function createSceneRenderQueue(connection: ConnectionOptions) {
  return new Queue<SceneRenderJob>("scene-render", {
    connection,
    defaultJobOptions: {
      attempts:         3,
      backoff:          { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail:     { count: 200 },
    },
  });
}

export function createScenePriorityQueue(connection: ConnectionOptions) {
  return new Queue<SceneRenderJob>("scene-priority", {
    connection,
    defaultJobOptions: {
      attempts:         3,
      priority:         1,
      backoff:          { type: "exponential", delay: 3000 },
      removeOnComplete: { count: 50 },
      removeOnFail:     { count: 100 },
    },
  });
}
