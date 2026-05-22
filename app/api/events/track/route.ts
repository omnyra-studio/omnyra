/* POST /api/events/track
 *
 * Server-validated channel for client-originated user events. The
 * client cannot write directly to the `events` table (no INSERT RLS
 * policy is granted). Instead it posts here with a Bearer token; the
 * server validates the session, whitelists the event type, and emits
 * the event with the AUTHENTICATED user_id (never a client-supplied id).
 *
 * Request body:
 *   { type: <whitelisted event type>, payload?: object }
 *
 * Whitelisted client-triggerable events:
 *   user_logged_in, onboarding_started, onboarding_completed,
 *   template_selected, video_viewed, video_completed,
 *   video_downloaded, video_shared
 *
 * Other event types (brief_*, render_*, user_signed_up) are emitted
 * only by their owning server routes — clients cannot fake them.
 */

import { getUserAndPlan } from "../../../../lib/auth";
import { trackEvent, type UserEventType } from "../../../../lib/events/trackEvent";
import { grantShareReward } from "../../../../lib/optimization/rewards";
import { markOfferAccepted } from "../../../../lib/revenue/throttle";

const CLIENT_TRIGGERABLE_EVENTS: ReadonlySet<UserEventType> = new Set<UserEventType>([
  "user_logged_in",
  "onboarding_started",
  "onboarding_completed",
  "template_selected",
  "video_viewed",
  "video_completed",
  "video_downloaded",
  "video_shared",
  "video_replayed",
  "offer_accepted",
  "offer_dismissed",
]);

interface TrackBody {
  type?: string;
  payload?: Record<string, unknown>;
}

export async function POST(request: Request) {
  const { user } = await getUserAndPlan(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: TrackBody;
  try {
    body = (await request.json()) as TrackBody;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const type = typeof body.type === "string" ? body.type : "";
  if (!type || !CLIENT_TRIGGERABLE_EVENTS.has(type as UserEventType)) {
    return Response.json(
      { error: "event_type_not_allowed", message: "Type missing or not in client whitelist" },
      { status: 400 },
    );
  }

  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};

  // Never trust a client-supplied user_id — overwrite with the
  // authenticated one. Strip any user_id field defensively.
  delete (payload as Record<string, unknown>).user_id;

  await trackEvent(user.id, type as UserEventType, payload);

  // AGS §8 — growth loop reward. Fires at most once per render via
  // ledger-level idempotency in grantShareReward().
  let reward: { granted: boolean; reason: string; amount?: number } | undefined;
  if (type === "video_shared") {
    const render_id = typeof (payload as { render_id?: unknown }).render_id === "string"
      ? (payload as { render_id: string }).render_id
      : null;
    reward = await grantShareReward(user.id, render_id);
  }

  // Offer-funnel: when the client confirms an offer was accepted, flip
  // the offer_log row so conversion analytics are accurate.
  if (type === "offer_accepted") {
    const revenueEventId = typeof (payload as { revenue_event_id?: unknown }).revenue_event_id === "string"
      ? (payload as { revenue_event_id: string }).revenue_event_id
      : null;
    await markOfferAccepted(user.id, revenueEventId);
  }

  return Response.json({ ok: true, type, reward });
}
