/**
 * State projector — derives current plan state from a sequence of AppEvents.
 *
 * This is a pure function: events → state. No DB access, no side effects.
 * Enables replay debugging: load all events for a correlationId and call
 * projectPlanState(events) to see exactly what happened and when.
 *
 * Usage:
 *   const events = await getEventStore().getByCorrelationId(planId);
 *   const state  = projectPlanState(events);
 */

import type { AppEvent } from "./types";

// ── Plan state shape ──────────────────────────────────────────────────────────

export type ShotRenderStatus = "pending" | "rendering" | "completed" | "failed";
export type VoiceoverStatus  = "pending" | "generating" | "completed" | "failed";
export type ComposeStatus    = "pending" | "started"    | "completed" | "failed";
export type PlanStatus       =
  | "unknown"
  | "planning"
  | "rendering"
  | "composing"
  | "completed"
  | "failed";

export interface ShotState {
  shotId:     string;
  shotNumber: number;
  status:     ShotRenderStatus;
  clipUrl?:   string;
  error?:     string;
}

export interface PlanState {
  planId:       string | null;
  projectId:    string | null;
  userId:       string | null;
  mode:         string | null;
  status:       PlanStatus;
  shots:        Record<string, ShotState>;    // keyed by shotId
  voiceover:    VoiceoverStatus;
  voiceoverUrl: string | null;
  composition:  ComposeStatus;
  videoUrl:     string | null;
  errorMessage: string | null;
  eventCount:   number;
  lastEventAt:  number | null;               // timestamp of last event
}

function initialPlanState(): PlanState {
  return {
    planId:       null,
    projectId:    null,
    userId:       null,
    mode:         null,
    status:       "unknown",
    shots:        {},
    voiceover:    "pending",
    voiceoverUrl: null,
    composition:  "pending",
    videoUrl:     null,
    errorMessage: null,
    eventCount:   0,
    lastEventAt:  null,
  };
}

// ── Reducer — one event → next state ─────────────────────────────────────────

function reduceOne(state: PlanState, event: AppEvent): PlanState {
  const base: Partial<PlanState> = {
    eventCount:  state.eventCount + 1,
    lastEventAt: event.timestamp,
  };

  switch (event.type) {
    case "ORCHESTRATION_STARTED":
      return { ...state, ...base,
        userId:   event.payload.userId,
        mode:     event.payload.mode,
        projectId: event.payload.projectId ?? state.projectId,
        status:   "planning",
      };

    case "PROJECT_CREATED":
      return { ...state, ...base,
        projectId: event.payload.projectId,
        mode:      event.payload.mode,
        userId:    event.payload.userId,
      };

    case "SHOT_PLAN_GENERATED":
      return { ...state, ...base,
        planId:    event.payload.planId,
        projectId: event.payload.projectId,
        mode:      event.payload.mode,
        status:    "rendering",
      };

    case "RENDER_CONTRACT_BUILT":
      return { ...state, ...base };

    case "SHOT_RENDER_STARTED": {
      const p = event.payload;
      return { ...state, ...base,
        shots: {
          ...state.shots,
          [p.shotId]: { shotId: p.shotId, shotNumber: p.shotNumber, status: "rendering" },
        },
      };
    }

    case "SHOT_RENDER_COMPLETED": {
      const p = event.payload;
      return { ...state, ...base,
        shots: {
          ...state.shots,
          [p.shotId]: { shotId: p.shotId, shotNumber: p.shotNumber, status: "completed", clipUrl: p.clipUrl },
        },
      };
    }

    case "SHOT_RENDER_FAILED": {
      const p = event.payload;
      return { ...state, ...base,
        shots: {
          ...state.shots,
          [p.shotId]: { shotId: p.shotId, shotNumber: p.shotNumber, status: "failed", error: p.error },
        },
      };
    }

    case "VOICEOVER_STARTED":
      return { ...state, ...base, voiceover: "generating" };

    case "VOICEOVER_COMPLETED":
      return { ...state, ...base,
        voiceover:    "completed",
        voiceoverUrl: event.payload.voiceoverUrl,
      };

    case "VOICEOVER_FAILED":
      return { ...state, ...base,
        voiceover:    "failed",
        errorMessage: event.payload.error,
      };

    case "COMPOSITION_STARTED":
      return { ...state, ...base,
        composition: "started",
        status:      "composing",
      };

    case "COMPOSITION_COMPLETED":
      return { ...state, ...base,
        composition: "completed",
        videoUrl:    event.payload.videoUrl,
        status:      "completed",
      };

    case "COMPOSITION_FAILED":
      return { ...state, ...base,
        composition:  "failed",
        errorMessage: event.payload.error,
        status:       "failed",
      };

    // Social events don't affect plan state
    case "PUBLISH_REQUESTED":
    case "PUBLISH_COMPLETED":
    case "PUBLISH_FAILED":
      return { ...state, ...base };

    default:
      return { ...state, ...base };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Derive the current plan state by replaying an ordered event sequence.
 * Events should be ordered by timestamp ascending (as returned by the store).
 *
 * @param events - All events for a single correlationId
 * @returns Projected PlanState — identical replay = identical result
 */
export function projectPlanState(events: AppEvent[]): PlanState {
  return events.reduce(reduceOne, initialPlanState());
}

/**
 * Compute a simple summary for dashboards / debugging.
 */
export function summarisePlanState(state: PlanState): string {
  const shots   = Object.values(state.shots);
  const done    = shots.filter(s => s.status === "completed").length;
  const failed  = shots.filter(s => s.status === "failed").length;
  const total   = shots.length;
  return (
    `plan=${state.planId ?? "??"} ` +
    `status=${state.status} ` +
    `shots=${done}/${total}${failed > 0 ? ` (${failed} failed)` : ""} ` +
    `voiceover=${state.voiceover} ` +
    `composition=${state.composition}`
  );
}
