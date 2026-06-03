"use client";

import { useEffect, useRef, useState } from "react";
import { sseParse, TERMINAL_EVENTS } from "./events";
import { reduce, initialState } from "./core/state-reducer";
import type { OrchestrationState } from "./core/state-reducer";
import type { OrchestrationEvent } from "./events";
import type { OrchestratorMode } from "./types";

export type { OrchestrationState };

interface UseOrchestrationStreamOptions {
  /** Called each time a new event arrives. */
  onEvent?: (event: OrchestrationEvent) => void;
}

/**
 * Subscribe to the SSE orchestration stream for a given plan.
 * Accumulates state via the deterministic reducer — the UI derives
 * everything from state, never from ad-hoc local variables.
 */
export function useOrchestrationStream(
  planId:    string | null,
  projectId: string,
  mode:      OrchestratorMode,
  options:   UseOrchestrationStreamOptions = {},
): OrchestrationState & { connected: boolean; error: string | null } {
  const [state, setState] = useState<OrchestrationState>(() =>
    initialState(projectId, mode, planId ?? undefined),
  );
  const [connected, setConnected] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!planId) return;

    // Reset state when planId changes
    setTimeout(() => {
      setState(initialState(projectId, mode, planId));
      setError(null);
    }, 0);

    const es = new EventSource(`/api/orchestrate-project/${planId}/stream`);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e: MessageEvent<string>) => {
      const event = sseParse(e.data);
      if (!event) return;

      options.onEvent?.(event);
      setState(prev => reduce(prev, event));

      // Close the stream once the pipeline is complete — no more events expected
      if ((TERMINAL_EVENTS as string[]).includes(event.type)) {
        es.close();
        setConnected(false);
      }
    };

    es.onerror = () => {
      setConnected(false);
      setError("Stream connection lost");
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [planId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, connected, error };
}
