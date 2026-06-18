/**
 * artifacts/backend/core/analytics/tracker.ts
 *
 * Consolidated analytics + PostHog + internal feedback.
 * Fixes: ensure critical events always fire server-side, brand memory usage tracked,
 * outcome recorded events, robust snapshotting.
 *
 * Live code uses PostHog node in lib/posthog-server.ts + components.
 * This is the improved central place.
 */

import { PostHog } from "posthog-node";

let phClient: PostHog | null = null;

function getPostHog(): PostHog | null {
  if (phClient) return phClient;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY || process.env.POSTHOG_API_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
  if (!key) return null;
  phClient = new PostHog(key, { host, flushAt: 1, flushInterval: 1000 });
  return phClient;
}

/**
 * Server-side event capture. Safe no-op if PostHog not configured.
 * Always also writes to internal events table when possible (for /api/analytics).
 */
export async function trackServerEvent(
  userId: string | null,
  event: string,
  properties: Record<string, any> = {}
) {
  const ph = getPostHog();
  if (ph && userId) {
    try {
      ph.capture({ distinctId: userId, event, properties: { ...properties, source: "server" } });
    } catch (e) {
      console.warn("[analytics:tracker] posthog capture failed", e);
    }
  }

  // Internal events / usage_events for dashboard analytics (best effort)
  if (userId) {
    try {
      const { supabaseAdmin } = await import("@/lib/supabase/admin");
      Promise.resolve(supabaseAdmin.from("events").insert({
        user_id: userId,
        event_type: event,
        metadata: properties,
        created_at: new Date().toISOString(),
      })).catch(() => {});
      // Also legacy usage_events if present
      Promise.resolve(supabaseAdmin.from("usage_events").insert({
        user_id: userId,
        event_type: event,
        credits_used: properties.credits_used ?? 0,
        metadata: properties,
        created_at: new Date().toISOString(),
      })).catch(() => {});
    } catch {}
  }

  console.info(`[ANALYTICS] ${event} user=${userId?.slice(0,8) ?? "anon"} props=${JSON.stringify(properties).slice(0,120)}`);
}

export async function trackBrandMemoryUsed(userId: string, source: string, suffixes: { kling?: string; flux?: string }) {
  await trackServerEvent(userId, "brand_memory_injected", {
    source,
    has_kling_suffix: !!suffixes.kling,
    has_flux_suffix: !!suffixes.flux,
    suffix_len: (suffixes.kling || "").length + (suffixes.flux || "").length,
  });
}

export async function trackGenerationRecorded(userId: string, generationId: string, template?: string) {
  await trackServerEvent(userId, "generation_recorded_for_learning", {
    generation_id: generationId,
    template,
  });
}

export async function trackOutcomeRecorded(userId: string, generationId: string, published: boolean, rating?: number) {
  await trackServerEvent(userId, "outcome_recorded", {
    generation_id: generationId,
    was_published: published,
    user_rating: rating,
  });
}

export async function flush() {
  const ph = getPostHog();
  if (ph) await ph.shutdown();
}
