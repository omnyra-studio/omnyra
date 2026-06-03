// Temporal Replay Debug System v1
// Event-sourced execution timeline — record events, replay state, step-through debug.

// ── Event Union Type ──────────────────────────────────────────────────────────

export type OmnyraEventType =
  | "pipeline_started"
  | "brand_state_loaded"
  | "scene_grammar_computed"
  | "physics_simulated"
  | "prompts_compiled"
  | "clip_generation_started"
  | "clip_generation_succeeded"
  | "clip_generation_failed"
  | "validation_completed"
  | "drift_detected"
  | "heal_cycle_started"
  | "mutation_applied"
  | "ab_test_started"
  | "ab_test_resolved"
  | "version_promoted"
  | "version_rolled_back"
  | "pipeline_completed"
  | "pipeline_failed";

export interface OmnyraEvent {
  eventId: string;
  eventType: OmnyraEventType;
  jobId: string;
  timestamp: number;
  sequenceNumber: number;
  payload: Record<string, unknown>;
  metadata: {
    durationMs?: number;
    sourceModule?: string;
    userId?: string;
  };
}

// ── Snapshot / Rebuilt State ──────────────────────────────────────────────────

export interface PipelineSnapshot {
  jobId: string;
  status: "pending" | "generating" | "validating" | "healing" | "complete" | "failed";
  sceneCount: number;
  promptVersion: string;
  generatedClips: number;
  failedClips: number;
  driftDetected: boolean;
  healCyclesApplied: number;
  lastEventType: OmnyraEventType | null;
  lastEventAt: number | null;
  totalDurationMs: number;
}

function initialSnapshot(jobId: string): PipelineSnapshot {
  return {
    jobId,
    status: "pending",
    sceneCount: 0,
    promptVersion: "unknown",
    generatedClips: 0,
    failedClips: 0,
    driftDetected: false,
    healCyclesApplied: 0,
    lastEventType: null,
    lastEventAt: null,
    totalDurationMs: 0,
  };
}

// ── State Rebuilder ───────────────────────────────────────────────────────────

export function rebuildState(events: OmnyraEvent[]): PipelineSnapshot {
  if (!events.length) return initialSnapshot("unknown");

  const sorted = [...events].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  const jobId = sorted[0]!.jobId;
  const snapshot = initialSnapshot(jobId);

  const startEvent = sorted.find(e => e.eventType === "pipeline_started");

  for (const event of sorted) {
    snapshot.lastEventType = event.eventType;
    snapshot.lastEventAt = event.timestamp;

    switch (event.eventType) {
      case "pipeline_started":
        snapshot.status = "generating";
        if (typeof event.payload.sceneCount === "number") {
          snapshot.sceneCount = event.payload.sceneCount;
        }
        break;

      case "prompts_compiled":
        if (typeof event.payload.promptVersion === "string") {
          snapshot.promptVersion = event.payload.promptVersion;
        }
        break;

      case "clip_generation_started":
        snapshot.status = "generating";
        break;

      case "clip_generation_succeeded":
        snapshot.generatedClips++;
        break;

      case "clip_generation_failed":
        snapshot.failedClips++;
        break;

      case "validation_completed":
        snapshot.status = "validating";
        break;

      case "drift_detected":
        snapshot.driftDetected = true;
        break;

      case "heal_cycle_started":
        snapshot.status = "healing";
        snapshot.healCyclesApplied++;
        break;

      case "pipeline_completed":
        snapshot.status = "complete";
        if (startEvent) {
          snapshot.totalDurationMs = event.timestamp - startEvent.timestamp;
        }
        break;

      case "pipeline_failed":
        snapshot.status = "failed";
        if (startEvent) {
          snapshot.totalDurationMs = event.timestamp - startEvent.timestamp;
        }
        break;
    }
  }

  return snapshot;
}

// ── Replay Storage ────────────────────────────────────────────────────────────

const eventStore = new Map<string, OmnyraEvent[]>();
let globalSequence = 0;

export function recordEvent(
  jobId: string,
  eventType: OmnyraEventType,
  payload: Record<string, unknown> = {},
  metadata: OmnyraEvent["metadata"] = {},
): OmnyraEvent {
  const event: OmnyraEvent = {
    eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    eventType,
    jobId,
    timestamp: Date.now(),
    sequenceNumber: ++globalSequence,
    payload,
    metadata,
  };

  const existing = eventStore.get(jobId) ?? [];
  existing.push(event);
  eventStore.set(jobId, existing);

  return event;
}

export function getJobEvents(jobId: string): OmnyraEvent[] {
  return eventStore.get(jobId) ?? [];
}

export function getJobSnapshot(jobId: string): PipelineSnapshot {
  const events = getJobEvents(jobId);
  return rebuildState(events);
}

export function clearJobEvents(jobId: string): void {
  eventStore.delete(jobId);
}

// ── Step-Through Debug ────────────────────────────────────────────────────────

export interface StepDebugFrame {
  step: number;
  event: OmnyraEvent;
  stateAfter: PipelineSnapshot;
}

export function stepThroughJob(jobId: string): StepDebugFrame[] {
  const events = [...getJobEvents(jobId)].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  const frames: StepDebugFrame[] = [];

  for (let i = 0; i < events.length; i++) {
    const eventsUpToHere = events.slice(0, i + 1);
    frames.push({
      step: i + 1,
      event: events[i]!,
      stateAfter: rebuildState(eventsUpToHere),
    });
  }

  return frames;
}

// ── Trace Reconstruction ──────────────────────────────────────────────────────

export interface ExecutionTrace {
  jobId: string;
  totalEvents: number;
  durationMs: number;
  criticalPath: OmnyraEventType[];
  healCycles: Array<{ at: number; version: string }>;
  finalStatus: PipelineSnapshot["status"];
}

export function reconstructTrace(jobId: string): ExecutionTrace {
  const events = [...getJobEvents(jobId)].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  const snapshot = rebuildState(events);

  const criticalTypes: OmnyraEventType[] = [
    "pipeline_started",
    "prompts_compiled",
    "clip_generation_started",
    "validation_completed",
    "drift_detected",
    "heal_cycle_started",
    "pipeline_completed",
    "pipeline_failed",
  ];

  const criticalPath = events
    .filter(e => criticalTypes.includes(e.eventType))
    .map(e => e.eventType);

  const healCycles = events
    .filter(e => e.eventType === "mutation_applied")
    .map(e => ({
      at: e.timestamp,
      version: typeof e.payload.targetVersion === "string" ? e.payload.targetVersion : "unknown",
    }));

  const start = events[0]?.timestamp ?? Date.now();
  const end = events[events.length - 1]?.timestamp ?? Date.now();

  return {
    jobId,
    totalEvents: events.length,
    durationMs: end - start,
    criticalPath,
    healCycles,
    finalStatus: snapshot.status,
  };
}
