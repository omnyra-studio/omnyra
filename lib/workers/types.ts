// Worker job types — all jobs that can be enqueued by the orchestration engine.
// Workers consume these; the queue delivers them.

export type WorkerJobType =
  | "render_shot"
  | "generate_voiceover"
  | "compose_video"
  | "render_shard";

export interface RenderShotJob {
  type:      "render_shot";
  planId:    string;
  shotDbId:  string;  // shots.id (UUID primary key)
  shotId:    string;  // shots.shot_id (director shot identifier e.g. "s01")
  userId:    string;
}

export interface GenerateVoiceoverJob {
  type:    "generate_voiceover";
  planId:  string;
  userId:  string;
  voiceId?: string;
}

export interface ComposeVideoJob {
  type:      "compose_video";
  planId:    string;
  projectId: string;
  userId:    string;
}

export interface RenderShardJob {
  type:      "render_shard";
  shard:     import("@/lib/render/types").RenderShard;
  projectId: string;
  userId:    string;
  fps:       number;
}

export type WorkerJob =
  | RenderShotJob
  | GenerateVoiceoverJob
  | ComposeVideoJob
  | RenderShardJob;

export interface WorkerResult {
  success: boolean;
  error?:  string;
}
