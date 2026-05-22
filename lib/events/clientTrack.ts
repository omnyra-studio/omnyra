"use client";

/* Browser-safe wrapper around POST /api/events/track.
 *
 * Use this from client components / pages when the user performs a
 * tracked engagement action:
 *
 *   import { clientTrack } from "@/lib/events/clientTrack";
 *   await clientTrack("video_shared", { render_id });
 *
 * The server attaches the authenticated user_id; the client cannot
 * forge it. Fire-and-forget by default — errors are logged, never
 * thrown, so an analytics blip never breaks the UI.
 */

import { createClient } from "../supabase/client";

const ENDPOINT = "/api/events/track";

export type ClientEventType =
  | "user_logged_in"
  | "onboarding_started"
  | "onboarding_completed"
  | "template_selected"
  | "video_viewed"
  | "video_completed"
  | "video_downloaded"
  | "video_shared";

export interface ClientTrackOptions {
  /** Throw on failure (default: false). */
  strict?: boolean;
  /** Override fetch (for tests). */
  fetchImpl?: typeof fetch;
}

export async function clientTrack(
  type: ClientEventType,
  payload: Record<string, unknown> = {},
  opts: ClientTrackOptions = {},
): Promise<boolean> {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      // Unauthenticated — nothing to track. Not an error.
      return false;
    }

    const f = opts.fetchImpl ?? fetch;
    const res = await f(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ type, payload }),
      keepalive: true, // survive page navigation for share/download events
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const msg = `[clientTrack] ${type} → ${res.status} ${body}`;
      if (opts.strict) throw new Error(msg);
      console.warn(msg);
      return false;
    }
    return true;
  } catch (err) {
    if (opts.strict) throw err;
    console.warn("[clientTrack] failed:", err);
    return false;
  }
}
