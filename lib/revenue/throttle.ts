/* Offer throttling helper.
 *
 * Wraps the `can_show_offer` and `log_offer_shown` PL/pgSQL functions.
 * The decision engine calls these BEFORE every offer to enforce:
 *
 *   - 1 offer per 24h (12h for high-churn-risk users)
 *   - 3 offers per 7 days
 *   - 8 offers per 30 days
 *
 * All limits live in SQL so they're consistent whether the check comes
 * from the engine, an admin tool, or a client probe.
 */

import { supabaseAdmin } from "../supabase/admin";

/** Spec-canonical offer types. */
export type OfferType = "upgrade" | "discount" | "credits" | "reactivation";

export interface ThrottleResult {
  allowed: boolean;
  reason: string;
  cooldown_remaining: number | null;
}

/**
 * Map the decision engine's internal action + rule onto the canonical
 * offer_type. Keep this in one place so the throttle log uses the same
 * vocabulary as the spec.
 */
export function classifyOfferType(args: {
  action_type: "show_upgrade" | "give_bonus_credits" | "discount_offer" | "no_action";
  rule?: string;
}): OfferType | null {
  switch (args.action_type) {
    case "show_upgrade":
      return "upgrade";
    case "give_bonus_credits":
      return "credits";
    case "discount_offer":
      return args.rule === "reactivation" ? "reactivation" : "discount";
    default:
      return null;
  }
}

export async function canShowOffer(userId: string, offerType?: OfferType): Promise<ThrottleResult> {
  const { data, error } = await supabaseAdmin.rpc("can_show_offer", {
    p_user_id: userId,
    p_offer_type: offerType ?? null,
  });
  if (error) {
    console.error("[throttle] can_show_offer failed:", error.message);
    // Fail CLOSED — never default to "allowed" if the RPC is broken.
    return { allowed: false, reason: `rpc_error:${error.message}`, cooldown_remaining: null };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: Boolean(row?.allowed),
    reason: String(row?.reason ?? "unknown"),
    cooldown_remaining: row?.cooldown_remaining ?? null,
  };
}

export async function logOfferShown(
  userId: string,
  offerType: OfferType,
  revenueEventId: string | null,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc("log_offer_shown", {
    p_user_id: userId,
    p_offer_type: offerType,
    p_revenue_event_id: revenueEventId,
  });
  if (error) {
    console.error("[throttle] log_offer_shown failed:", error.message);
    return null;
  }
  return typeof data === "string" ? data : null;
}

export async function markOfferAccepted(userId: string, revenueEventId: string | null): Promise<void> {
  if (!revenueEventId) {
    // Best-effort: mark the most recent offer for this user as accepted.
    await supabaseAdmin
      .from("offer_log")
      .update({ accepted: true, accepted_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("accepted", false)
      .order("created_at", { ascending: false })
      .limit(1);
    return;
  }
  await supabaseAdmin
    .from("offer_log")
    .update({ accepted: true, accepted_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("revenue_event_id", revenueEventId);
}
