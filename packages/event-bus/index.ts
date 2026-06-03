// Event Bus — in-process pub/sub (Option A, MVP).
// Key rule: event bus is the ONLY communication layer between services.
// No direct service-to-service calls.

import { EventEmitter } from "events";

// ── Topic registry ────────────────────────────────────────────────────────────

export type OmnyraTopics =
  | "scene.created"
  | "prompt.generated"
  | "generation.started"
  | "generation.completed"
  | "validation.completed"
  | "drift.detected"
  | "brand.state.updated"
  | "job.failed"
  | "self.heal.triggered";

// ── Event payloads ────────────────────────────────────────────────────────────

export interface SceneCreatedPayload {
  jobId: string;
  sceneIndex: number;
  prompt: string;
  sceneType: string;
}

export interface PromptGeneratedPayload {
  jobId: string;
  sceneIndex: number;
  promptVersion: string;
  compiledPrompt: string;
}

export interface GenerationStartedPayload {
  jobId: string;
  sceneIndex: number;
  provider: "kling" | "flux" | "runway" | "smart_motion";
  model: string;
}

export interface GenerationCompletedPayload {
  jobId: string;
  sceneIndex: number;
  outputUrl: string;
  latencyMs: number;
  provider: string;
}

export interface ValidationCompletedPayload {
  jobId: string;
  sceneIndex: number;
  driftScore: number;
  passed: boolean;
  flags: string[];
}

export interface DriftDetectedPayload {
  jobId: string;
  sceneIndex: number;
  driftType: "character" | "environment" | "object";
  severity: "low" | "medium" | "high";
  score: number;
}

export interface BrandStateUpdatedPayload {
  jobId: string;
  brandStateVersion: string;
  updatedFields: string[];
}

export interface JobFailedPayload {
  jobId: string;
  stage: string;
  error: string;
}

export interface SelfHealTriggeredPayload {
  jobId: string;
  rootCause: string;
  affectedLayer: "brand" | "grammar" | "physics" | "prompt" | "generation";
  mutationType: string;
}

export type TopicPayloadMap = {
  "scene.created": SceneCreatedPayload;
  "prompt.generated": PromptGeneratedPayload;
  "generation.started": GenerationStartedPayload;
  "generation.completed": GenerationCompletedPayload;
  "validation.completed": ValidationCompletedPayload;
  "drift.detected": DriftDetectedPayload;
  "brand.state.updated": BrandStateUpdatedPayload;
  "job.failed": JobFailedPayload;
  "self.heal.triggered": SelfHealTriggeredPayload;
};

// ── Typed bus ─────────────────────────────────────────────────────────────────

class OmnyraEventBus extends EventEmitter {
  publish<T extends OmnyraTopics>(topic: T, payload: TopicPayloadMap[T]): void {
    this.emit(topic, payload);
  }

  subscribe<T extends OmnyraTopics>(
    topic: T,
    handler: (payload: TopicPayloadMap[T]) => void,
  ): () => void {
    this.on(topic, handler);
    return () => this.off(topic, handler);
  }
}

// Singleton — one bus per process
export const eventBus = new OmnyraEventBus();
eventBus.setMaxListeners(50);
