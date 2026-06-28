/**
 * Server-side PostHog event tracking.
 *
 * posthog-node is already installed. This module wraps it with:
 *   - fire-and-forget (never await, never block pipeline)
 *   - no-op when POSTHOG_API_KEY is absent (safe in dev)
 *   - typed event catalog matching Omnyra's content loop
 *
 * Usage:
 *   track(userId, "video_created", { niche, durationSec, sceneCount })
 */

import { PostHog } from "posthog-node";

let _client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.POSTHOG_API_KEY;
  if (!key) return null;
  if (!_client) {
    _client = new PostHog(key, {
      host:         process.env.POSTHOG_HOST ?? "https://app.posthog.com",
      flushAt:      10,
      flushInterval: 5000,
    });
  }
  return _client;
}

// ── Typed event catalog ────────────────────────────────────────────────────────

export type OmnyraEvent =
  | "video_created"       // pipeline completed, MP4 ready
  | "video_failed"        // pipeline threw before assembly
  | "scene_failed"        // individual scene clip failed all attempts
  | "scene_vision_fail"   // vision validator hard-failed (clothing/subject)
  | "video_downloaded"    // user triggered download
  | "script_selected"     // user picked one of the 5 script variants
  | "script_generated"    // generate-scripts completed
  | "trailer_requested"   // user triggered trailer cut
  | "brand_memory_applied"; // brand memory overlay was used

interface EventProps {
  // common optional fields — add only what's known at call site
  niche?:       string;
  scriptType?:  string;
  durationSec?: number;
  sceneCount?:  number;
  sceneIndex?:  number;
  provider?:    string;
  retries?:     number;
  qualityScore?: number;
  trendScore?:  number;
  [key: string]: unknown;
}

/**
 * Fire-and-forget event. Never awaited — never blocks the pipeline.
 * Safe to call from any server context.
 */
export function track(
  userId:     string,
  event:      OmnyraEvent,
  properties: EventProps = {},
): void {
  const client = getClient();
  if (!client) return; // dev/no-key: silent no-op

  // Don't await — fire and forget
  client.capture({
    distinctId: userId,
    event,
    properties: {
      ...properties,
      $lib: "omnyra-server",
    },
  });
}

/**
 * Flush pending events — call at end of long-running routes
 * (Vercel serverless fns may exit before the flush interval fires).
 */
export async function flushEvents(): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.shutdown();
  _client = null; // reset so next request creates a fresh client
}
