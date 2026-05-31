/**
 * Canonical event type definitions for the Omnyra ESOK.
 *
 * Every mutation in the system is expressed as one of these events.
 * Events are append-only, immutable, and correlated by correlationId.
 *
 * correlationId convention:
 *   orchestration flows  → planId (once created) or projectId before planId exists
 *   isolated shot render → planId
 *   social publish       → postId
 *
 * All timestamps are Unix epoch milliseconds.
 */

// ── Base ───────────────────────────────────────────────────────────────────────

export interface BaseEvent {
  readonly id:            string;   // uuid — unique per event
  readonly type:          string;   // discriminant
  readonly correlationId: string;   // workflow chain identifier
  readonly timestamp:     number;   // Date.now() — ms since epoch
}

// ── Orchestration lifecycle ────────────────────────────────────────────────────

export interface OrchestrationStartedEvent extends BaseEvent {
  type: "ORCHESTRATION_STARTED";
  payload: { userId: string; mode: string; projectId?: string };
}

export interface ProjectCreatedEvent extends BaseEvent {
  type: "PROJECT_CREATED";
  payload: { projectId: string; mode: string; userId: string };
}

export interface ShotPlanGeneratedEvent extends BaseEvent {
  type: "SHOT_PLAN_GENERATED";
  payload: {
    planId:        string;
    projectId:     string;
    shotCount:     number;
    mode:          string;
    totalDuration: number;
    avatarShots:   number;
    falShots:      number;
  };
}

export interface RenderContractBuiltEvent extends BaseEvent {
  type: "RENDER_CONTRACT_BUILT";
  payload: {
    planId:      string;
    clipCount:   number;
    fps:         number;
    totalFrames: number;
    status:      "valid" | "invalid";
  };
}

// ── Shot render lifecycle ──────────────────────────────────────────────────────

export interface ShotRenderStartedEvent extends BaseEvent {
  type: "SHOT_RENDER_STARTED";
  payload: { planId: string; shotId: string; shotNumber: number; renderer: string };
}

export interface ShotRenderCompletedEvent extends BaseEvent {
  type: "SHOT_RENDER_COMPLETED";
  payload: { planId: string; shotId: string; shotNumber: number; clipUrl: string };
}

export interface ShotRenderFailedEvent extends BaseEvent {
  type: "SHOT_RENDER_FAILED";
  payload: { planId: string; shotId: string; shotNumber: number; error: string };
}

// ── Voiceover lifecycle ────────────────────────────────────────────────────────

export interface VoiceoverStartedEvent extends BaseEvent {
  type: "VOICEOVER_STARTED";
  payload: { planId: string };
}

export interface VoiceoverCompletedEvent extends BaseEvent {
  type: "VOICEOVER_COMPLETED";
  payload: { planId: string; voiceoverUrl: string; durationSeconds: number };
}

export interface VoiceoverFailedEvent extends BaseEvent {
  type: "VOICEOVER_FAILED";
  payload: { planId: string; error: string };
}

// ── Provider routing lifecycle ────────────────────────────────────────────────

export interface ProviderAssignedEvent extends BaseEvent {
  type: "PROVIDER_ASSIGNED";
  payload: {
    clipId:     string;
    providerId: string;
    score:      number;
    seed:       string;
    mode:       string | null;
  };
}

export interface ProviderFallbackTriggeredEvent extends BaseEvent {
  type: "PROVIDER_FALLBACK_TRIGGERED";
  payload: {
    clipId:           string;
    originalProvider: string;
    fallbackProvider: string;
    reason:           string;
  };
}

export interface ProviderExecutionFailedEvent extends BaseEvent {
  type: "PROVIDER_EXECUTION_FAILED";
  payload: { clipId: string; providerId: string; error: string };
}

// ── Shard render lifecycle ────────────────────────────────────────────────────

export interface ShardRenderStartedEvent extends BaseEvent {
  type: "SHARD_RENDER_STARTED";
  payload: { shardId: string; projectId: string; clipCount: number };
}

export interface ShardRenderCompletedEvent extends BaseEvent {
  type: "SHARD_RENDER_COMPLETED";
  payload: { shardId: string; outputUrl: string; fromCache: boolean };
}

export interface ShardRenderFailedEvent extends BaseEvent {
  type: "SHARD_RENDER_FAILED";
  payload: { shardId: string; error: string };
}

// ── Composition lifecycle ─────────────────────────────────────────────────────

export interface CompositionStartedEvent extends BaseEvent {
  type: "COMPOSITION_STARTED";
  payload: { planId: string; projectId: string };
}

export interface CompositionCompletedEvent extends BaseEvent {
  type: "COMPOSITION_COMPLETED";
  payload: { planId: string; projectId: string; videoUrl: string; durationSeconds: number | null };
}

export interface CompositionFailedEvent extends BaseEvent {
  type: "COMPOSITION_FAILED";
  payload: { planId: string; projectId: string; error: string };
}

// ── Social publish lifecycle ──────────────────────────────────────────────────

export interface PublishRequestedEvent extends BaseEvent {
  type: "PUBLISH_REQUESTED";
  payload: { postId: string; userId: string; platforms: string[] };
}

export interface PublishCompletedEvent extends BaseEvent {
  type: "PUBLISH_COMPLETED";
  payload: { postId: string; platforms: string[]; results: Record<string, unknown> };
}

export interface PublishFailedEvent extends BaseEvent {
  type: "PUBLISH_FAILED";
  payload: { postId: string; error: string };
}

// ── Union ──────────────────────────────────────────────────────────────────────

export type AppEvent =
  | OrchestrationStartedEvent
  | ProjectCreatedEvent
  | ShotPlanGeneratedEvent
  | RenderContractBuiltEvent
  | ProviderAssignedEvent
  | ProviderFallbackTriggeredEvent
  | ProviderExecutionFailedEvent
  | ShotRenderStartedEvent
  | ShotRenderCompletedEvent
  | ShotRenderFailedEvent
  | ShardRenderStartedEvent
  | ShardRenderCompletedEvent
  | ShardRenderFailedEvent
  | VoiceoverStartedEvent
  | VoiceoverCompletedEvent
  | VoiceoverFailedEvent
  | CompositionStartedEvent
  | CompositionCompletedEvent
  | CompositionFailedEvent
  | PublishRequestedEvent
  | PublishCompletedEvent
  | PublishFailedEvent;

export type AppEventType = AppEvent["type"];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract all events of a specific type from an array. */
export function filterEvents<T extends AppEvent>(
  events: AppEvent[],
  type: T["type"],
): T[] {
  return events.filter((e): e is T => e.type === type);
}
