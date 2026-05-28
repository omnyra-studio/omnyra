/**
 * Event Store — append-only persistent store for AppEvents.
 *
 * Backend: Supabase `orchestration_events` table.
 * The table is append-only — no UPDATE or DELETE operations are ever issued.
 *
 * Required Supabase migration (run once):
 * ─────────────────────────────────────────
 * CREATE TABLE IF NOT EXISTS orchestration_events (
 *   id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
 *   type           text        NOT NULL,
 *   correlation_id text        NOT NULL,
 *   payload        jsonb       NOT NULL DEFAULT '{}',
 *   created_at     timestamptz DEFAULT now() NOT NULL
 * );
 * CREATE INDEX IF NOT EXISTS orchestration_events_correlation_id_idx
 *   ON orchestration_events(correlation_id);
 * CREATE INDEX IF NOT EXISTS orchestration_events_type_idx
 *   ON orchestration_events(type);
 * ─────────────────────────────────────────
 *
 * RLS: Service role bypasses RLS. Application users should NOT have
 * direct access to this table — it is an internal audit log only.
 */

import { createClient } from "@supabase/supabase-js";
import type { AppEvent } from "./types";

// ── Interface ──────────────────────────────────────────────────────────────────

export interface EventStore {
  /** Persist one event. Append-only — never updates existing events. */
  append(event: AppEvent): Promise<void>;

  /** Return all events for a workflow, ordered by timestamp ascending. */
  getByCorrelationId(correlationId: string): Promise<AppEvent[]>;

  /** Return the N most recent events of a given type across all workflows. */
  getRecentByType(type: AppEvent["type"], limit?: number): Promise<AppEvent[]>;
}

// ── Supabase implementation ───────────────────────────────────────────────────

export class SupabaseEventStore implements EventStore {
  private client() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }

  async append(event: AppEvent): Promise<void> {
    const { error } = await this.client()
      .from("orchestration_events")
      .insert({
        id:             event.id,
        type:           event.type,
        correlation_id: event.correlationId,
        payload:        event.payload,
        created_at:     new Date(event.timestamp).toISOString(),
      });

    if (error) {
      // Surface the error so the emitter can log it without throwing to callers.
      throw new Error(`[event-store] append failed: ${error.message}`);
    }
  }

  async getByCorrelationId(correlationId: string): Promise<AppEvent[]> {
    const { data, error } = await this.client()
      .from("orchestration_events")
      .select("id, type, correlation_id, payload, created_at")
      .eq("correlation_id", correlationId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(`[event-store] query failed: ${error.message}`);

    return (data ?? []).map(rowToEvent);
  }

  async getRecentByType(type: AppEvent["type"], limit = 50): Promise<AppEvent[]> {
    const { data, error } = await this.client()
      .from("orchestration_events")
      .select("id, type, correlation_id, payload, created_at")
      .eq("type", type)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(`[event-store] query failed: ${error.message}`);

    return (data ?? []).map(rowToEvent);
  }
}

// ── Row → AppEvent mapping ────────────────────────────────────────────────────

function rowToEvent(row: {
  id:             string;
  type:           string;
  correlation_id: string;
  payload:        unknown;
  created_at:     string;
}): AppEvent {
  return {
    id:            row.id,
    type:          row.type,
    correlationId: row.correlation_id,
    timestamp:     new Date(row.created_at).getTime(),
    payload:       row.payload,
  } as AppEvent;
}

// ── Singleton factory ─────────────────────────────────────────────────────────

let _store: EventStore | null = null;

export function getEventStore(): EventStore {
  if (!_store) _store = new SupabaseEventStore();
  return _store;
}
