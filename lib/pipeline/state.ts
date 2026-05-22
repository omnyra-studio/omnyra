/* State reconstruction from the event stream.
 *
 * Per spec §6: "STATE IS NOT STORED. STATE IS REBUILT."
 *
 * The client can refresh /create at any time and rebuild full pipeline
 * state from the events alone. This module is the server-side helper
 * that returns the events + a normalised state snapshot in one call.
 *
 * Server-only.
 */

import { supabaseAdmin } from "../supabase/admin";

export type UIStage =
  | "idle"
  | "script_generating"
  | "voice_generating"
  | "video_generating"
  | "finalising"
  | "complete"
  | "failed";

const STAGE_FROM_EVENT: Record<string, UIStage> = {
  render_created:     "idle",
  brief_validated:    "idle",
  script_generated:   "script_generating",
  voice_started:      "voice_generating",
  voice_completed:    "voice_generating",
  motion_started:     "video_generating",
  motion_completed:   "video_generating",
  lipsync_started:    "finalising",
  lipsync_completed:  "finalising",
  render_finalised:   "complete",
  render_failed:      "failed",
};

export interface RenderEventRow {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface RenderStateSnapshot {
  render_id: string;
  ui_stage: UIStage;
  derived_status: string;
  latest_event_type: string | null;
  latest_event_at: string | null;
  video_url: string | null;
  audio_url: string | null;
  scene_urls: string[] | null;
  error_message: string | null;
  events: RenderEventRow[];
}

export interface FetchOptions {
  /** If provided, enforce ownership against this user_id. */
  user_id?: string;
}

export async function loadRenderState(
  render_id: string,
  opts: FetchOptions = {},
): Promise<RenderStateSnapshot | null> {
  const { data: stateRow } = await supabaseAdmin
    .from("render_state_derived")
    .select(
      "render_id, user_id, derived_status, ui_stage, latest_event_type, latest_event_at, video_url, audio_url",
    )
    .eq("render_id", render_id)
    .maybeSingle();

  if (!stateRow) return null;
  if (opts.user_id && (stateRow as { user_id?: string }).user_id !== opts.user_id) return null;

  // Pull the renders row for fields not exposed by the view.
  const { data: extra } = await supabaseAdmin
    .from("renders")
    .select("scene_urls, error_message")
    .eq("id", render_id)
    .maybeSingle();

  const { data: events } = await supabaseAdmin
    .from("render_events")
    .select("id, event_type, payload, created_at")
    .eq("render_id", render_id)
    .order("created_at", { ascending: true });

  return {
    render_id,
    ui_stage: STAGE_FROM_EVENT[String(stateRow.latest_event_type ?? "")] ?? "idle",
    derived_status: String(stateRow.derived_status),
    latest_event_type: stateRow.latest_event_type ?? null,
    latest_event_at: stateRow.latest_event_at ?? null,
    video_url: (stateRow.video_url as string) ?? null,
    audio_url: (stateRow.audio_url as string) ?? null,
    scene_urls: (extra as { scene_urls?: string[] | null } | null)?.scene_urls ?? null,
    error_message: (extra as { error_message?: string | null } | null)?.error_message ?? null,
    events: (events ?? []) as RenderEventRow[],
  };
}
