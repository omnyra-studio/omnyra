/* AGS §8 — share-reward growth loop.
 *
 * When a user shares a video:
 *   1. Grant a one-time bonus credit, scoped to that specific render.
 *      Idempotent via credit_transactions.description = `share_bonus:${render_id}`.
 *   2. Extend premium_unlocked_until on user_profiles_extended by
 *      SHARE_PREMIUM_EXTEND_DAYS, capped at MAX_UNLOCK_DAYS_FROM_NOW.
 *      Extension is idempotent — bounded by the cap.
 *
 * Both actions are reversible:
 *   - Credit grants can be refunded by inserting a negative ledger row.
 *   - The premium window self-expires on date arithmetic; no manual
 *     cleanup required.
 */

import { supabaseAdmin } from "../supabase/admin";

const SHARE_BONUS_CREDITS = 10;
const SHARE_PREMIUM_EXTEND_DAYS = 7;
const MAX_UNLOCK_DAYS_FROM_NOW = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ShareRewardResult {
  granted: boolean;
  reason: "granted" | "already_rewarded" | "no_render_id" | "error";
  amount?: number;
}

export async function grantShareReward(
  userId: string,
  renderId: string | null | undefined,
): Promise<ShareRewardResult> {
  if (!renderId) return { granted: false, reason: "no_render_id" };

  const description = `share_bonus:${renderId}`;

  // Idempotency check — exact description match on this user.
  const { data: existing, error: lookupErr } = await supabaseAdmin
    .from("credit_transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("description", description)
    .limit(1);

  if (lookupErr) {
    console.error("[rewards] lookup failed:", lookupErr.message);
    return { granted: false, reason: "error" };
  }
  if (existing && existing.length > 0) {
    return { granted: false, reason: "already_rewarded" };
  }

  const { error: txErr } = await supabaseAdmin.from("credit_transactions").insert({
    user_id: userId,
    amount: SHARE_BONUS_CREDITS,
    type: "share_bonus",
    description,
  });

  if (txErr) {
    console.error("[rewards] insert failed:", txErr.message);
    return { granted: false, reason: "error" };
  }

  // Extend premium unlock window. Read current value; extend by
  // SHARE_PREMIUM_EXTEND_DAYS, but never beyond MAX_UNLOCK_DAYS_FROM_NOW.
  const { data: existingRow } = await supabaseAdmin
    .from("user_profiles_extended")
    .select("premium_unlocked_until")
    .eq("user_id", userId)
    .maybeSingle();

  const now = Date.now();
  const base = existingRow?.premium_unlocked_until
    ? Math.max(now, new Date(existingRow.premium_unlocked_until).getTime())
    : now;
  const proposed = base + SHARE_PREMIUM_EXTEND_DAYS * DAY_MS;
  const cap = now + MAX_UNLOCK_DAYS_FROM_NOW * DAY_MS;
  const next = new Date(Math.min(proposed, cap)).toISOString();

  await supabaseAdmin
    .from("user_profiles_extended")
    .upsert(
      { user_id: userId, premium_unlocked_until: next, recomputed_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

  return { granted: true, reason: "granted", amount: SHARE_BONUS_CREDITS };
}
