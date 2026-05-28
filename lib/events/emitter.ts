/**
 * Event emitter — thin wrapper over the event store.
 *
 * Rules:
 *   - emit() is ALWAYS non-throwing. If storage fails, we log and continue.
 *     Events are observability — they must never block the happy path.
 *   - The id and timestamp are auto-filled. Callers only supply type,
 *     correlationId, and payload.
 *   - emit() awaits internally but callers may fire-and-forget with .catch(()=>{})
 *     if they need maximum throughput. Critical paths should await.
 */

import { getEventStore } from "./event-store";
import type { AppEvent } from "./types";

type EventInput = Omit<AppEvent, "id" | "timestamp">;

/**
 * Emit one event. Fills id (uuid) and timestamp (now) automatically.
 * Never throws — failures are logged as warnings only.
 */
export async function emit(input: EventInput): Promise<void> {
  const event: AppEvent = {
    id:        crypto.randomUUID(),
    timestamp: Date.now(),
    ...input,
  } as AppEvent;

  try {
    await getEventStore().append(event);
  } catch (err) {
    console.warn(
      `[events] emit failed for ${event.type} (correlationId=${event.correlationId}):`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Emit and forget — submit without blocking the caller.
 * Use for worker progress events where a brief delay is acceptable.
 */
export function emitAndForget(input: EventInput): void {
  emit(input).catch(() => {
    // Already logged inside emit() — silence the unhandled rejection.
  });
}
