import type { ShotPacket } from "@/lib/types/shot";
import type { OrchestratorMode } from "@/lib/orchestration/types";
import type { OrchestrationEvent, ScriptSummary } from "@/lib/orchestration/events";

export type ShotStatus = "pending" | "queued" | "rendering" | "completed" | "failed";

export interface ShotRunState {
  shotId:   string;
  status:   ShotStatus;
  clipUrl?: string;
  error?:   string;
}

export interface OrchestrationState {
  projectId:     string;
  planId:        string | null;
  mode:          OrchestratorMode;

  script:        ScriptSummary | null;
  shots:         ShotPacket[];
  shotStates:    Record<string, ShotRunState>;

  voiceoverUrl:  string | null;
  isComposing:   boolean;
  finalVideoUrl: string | null;
  completedAt:   string | null;  // ISO string
}

export function initialState(
  projectId: string,
  mode: OrchestratorMode,
  planId?: string,
): OrchestrationState {
  return {
    projectId,
    planId:        planId ?? null,
    mode,
    script:        null,
    shots:         [],
    shotStates:    {},
    voiceoverUrl:  null,
    isComposing:   false,
    finalVideoUrl: null,
    completedAt:   null,
  };
}

/** Pure function — returns next state from current state + one event. */
export function reduce(
  state: OrchestrationState,
  event: OrchestrationEvent,
): OrchestrationState {
  switch (event.type) {
    case "SCRIPT_CREATED":
      return { ...state, script: event.payload };

    case "SHOT_PLAN_CREATED": {
      const shotStates: Record<string, ShotRunState> = {};
      for (const s of event.payload) {
        shotStates[s.shot_id] = { shotId: s.shot_id, status: "pending" };
      }
      return { ...state, shots: event.payload, shotStates };
    }

    case "SHOT_RENDERED": {
      const shotStates = {
        ...state.shotStates,
        [event.shotId]: { shotId: event.shotId, status: "completed" as ShotStatus, clipUrl: event.clipUrl },
      };
      return { ...state, shotStates };
    }

    case "SHOT_FAILED": {
      const shotStates = {
        ...state.shotStates,
        [event.shotId]: { shotId: event.shotId, status: "failed" as ShotStatus, error: event.error },
      };
      return { ...state, shotStates };
    }

    case "VOICEOVER_STARTED":
      return state;  // no state change — purely a progress signal

    case "VOICEOVER_READY":
      return { ...state, voiceoverUrl: event.url };

    case "COMPOSITION_STARTED":
      return { ...state, isComposing: true };

    case "PROJECT_COMPLETED":
      return {
        ...state,
        finalVideoUrl: event.url,
        isComposing:   false,
        completedAt:   new Date().toISOString(),
      };

    default:
      return state;
  }
}

/** Replay a sequence of events to rebuild state from scratch. */
export function replay(
  projectId: string,
  mode: OrchestratorMode,
  events: OrchestrationEvent[],
  planId?: string,
): OrchestrationState {
  return events.reduce(reduce, initialState(projectId, mode, planId));
}
