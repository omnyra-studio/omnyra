/* Server-only emitter for the GLOBAL user-event stream.
 *
 * Inserts a row into `public.events`. This is the canonical foundation
 * for product analytics, funnel tracking, virality scoring, churn
 * detection, and the autonomous optimisation layer.
 *
 * RULES (from spec):
 *   1. NEVER compute analytics from UI state — only from this stream.
 *   2. NEVER trust client-side counters.
 *   3. EVERY event must include a user_id (null only for system events
 *      that explicitly have no user, e.g. cron jobs).
 *   4. Payload must include the relevant context (template, render_id,
 *      duration, etc.) for downstream queries.
 *
 * Render-pipeline-internal events (voice_started, motion_started, etc.)
 * use a DIFFERENT helper (`emitEvent` in lib/render-engine.ts) which
 * writes to `render_events` — that's the high-volume realtime UI stream.
 * Two streams, two purposes.
 */

import { supabaseAdmin } from "../supabase/admin";

/**
 * Canonical user-event types. Adding a new type? Update:
 *   1. this union
 *   2. analytics_views.sql / funnel views if it belongs in the funnel
 *   3. the trigger in content_scores_table.sql if it affects viral_score
 */
export type UserEventType =
  // Auth
  | "user_signed_up"
  | "user_logged_in"
  // Onboarding
  | "onboarding_started"
  | "onboarding_completed"
  // Creation flow
  | "template_selected"
  | "brief_submitted"
  | "brief_created"
  | "render_requested"
  // Pipeline
  | "draft_generated"
  | "render_started"
  | "render_completed"
  | "render_failed"
  // Engagement
  | "video_viewed"
  | "video_completed"
  | "video_downloaded"
  | "video_shared"
  | "video_replayed"
  | "video_regenerated"
  // Revenue
  | "offer_shown"
  | "offer_accepted"
  | "offer_dismissed"
  | "upgrade_prompt_shown"
  | "subscription_purchased"
  | "subscription_renewed"
  | "subscription_canceled"
  | "topup_purchased"
  | "payment_failed";

export interface TrackOptions {
  /** Throw on insert failure. Default: false (errors logged but not thrown). */
  strict?: boolean;
}

/**
 * Emit a user event. The single canonical entry point for the global
 * events stream. Server-only — never call from a client component.
 *
 *   await trackEvent(user.id, "brief_submitted", { template, duration })
 *
 * @returns Promise that resolves once the row is written.
 */
export async function trackEvent(
  userId: string | null,
  type: UserEventType,
  payload: Record<string, unknown> = {},
  opts: TrackOptions = {},
): Promise<void> {
  const { error } = await supabaseAdmin.from("events").insert({
    user_id: userId,
    type,
    payload,
  });

  if (error) {
    const msg = `[events] failed to emit ${type}: ${error.message}`;
    console.error(msg);
    if (opts.strict) throw new Error(msg);
  }
}

/* Backwards-compatible alias. Prefer `trackEvent` in new code. */
export const emitUserEvent = trackEvent;
