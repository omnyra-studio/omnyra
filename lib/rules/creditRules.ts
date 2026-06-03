import { getCreditBalance, deductCreditsAtomic, replenishCredits } from "@/lib/db/credits";
import { supabaseAdmin } from "@/lib/supabase/admin";

// ── Credit cost table ─────────────────────────────────────────────────────────

export const CREDIT_COSTS: Record<string, number> = {
  // Text / strategy (cheap — core product)
  viral_strategy_generate: 1,
  script_generation:       0,
  brief_generation:        0,
  // Image
  image_standard:          3,
  image_hd:                6,
  // Voice
  voice_30s:               5,
  voice_60s:               10,
  voice_clone:             15,  // one-time IVC clone creation via ElevenLabs
  // Video
  video_preview:           10,  // ~15s smart-motion
  video_cinematic:         20,  // ~20-30s Kling standard
  video_avatar:            40,  // ~30s avatar
  video_full_sequence:     80,  // ~60s multi-clip sequence
};

export function videoCreditCost(klingClips: number, smartMotionClips: number): number {
  // Per-clip costs aligned with provider pricing:
  // Kling clip (~10s): 8 credits
  // Smart motion clip: 2 credits
  // Minimum charge: 10 credits per request
  const raw = klingClips * 8 + smartMotionClips * 2;
  return Math.max(10, raw);
}

// ── Guards ────────────────────────────────────────────────────────────────────

export interface CreditCheckResult {
  allowed: boolean;
  balance: number;
  cost: number;
  planType: string;
  reason?: string;
}

export async function checkAndDeductCredits(
  userId: string,
  action: string,
  overrideCost?: number,
): Promise<CreditCheckResult> {
  const cost = overrideCost ?? CREDIT_COSTS[action] ?? 1;

  const bal = await getCreditBalance(userId);
  if (!bal) {
    return { allowed: false, balance: 0, cost, planType: "free", reason: "user_not_found" };
  }

  if (bal.balance < cost) {
    return {
      allowed: false,
      balance: bal.balance,
      cost,
      planType: bal.planType,
      reason: "insufficient_credits",
    };
  }

  const deducted = await deductCreditsAtomic(userId, cost);
  if (!deducted) {
    // Race condition: concurrent request consumed the credits
    const updated = await getCreditBalance(userId);
    return {
      allowed: false,
      balance: updated?.balance ?? 0,
      cost,
      planType: bal.planType,
      reason: "concurrent_deduction_failed",
    };
  }

  return { allowed: true, balance: bal.balance - cost, cost, planType: bal.planType };
}

// ── Video credit reservation ─────────────────────────────────────────────────
// Reserve before render starts. Finalize on success. Release on failure.
// This prevents users from losing credits on failed video jobs.

export interface CreditReservation {
  reservationId: string;
  userId: string;
  credits: number;
}

export async function reserveVideoCredits(
  userId: string,
  credits: number,
): Promise<CreditReservation | null> {
  // Check + atomically deduct (same as regular deduction — credits are reserved by holding)
  const result = await checkAndDeductCredits(userId, "video_reservation", credits);
  if (!result.allowed) return null;

  // Record the reservation for potential reversal
  const { data } = await supabaseAdmin
    .from("credit_reservations")
    .insert({
      user_id: userId,
      credits,
      status: "reserved",
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10-minute window
    })
    .select("id")
    .single();

  if (!data) {
    // Reservation record failed — refund immediately to prevent credit loss
    await replenishCreditsPartial(userId, credits);
    return null;
  }

  return { reservationId: data.id as string, userId, credits };
}

export async function finalizeVideoCredits(reservation: CreditReservation): Promise<void> {
  // Mark reservation as finalized — credits already deducted, nothing to do
  await supabaseAdmin
    .from("credit_reservations")
    .update({ status: "finalized" })
    .eq("id", reservation.reservationId);
}

export async function releaseVideoCredits(reservation: CreditReservation): Promise<void> {
  // Refund reserved credits back to user
  await replenishCreditsPartial(reservation.userId, reservation.credits);
  await supabaseAdmin
    .from("credit_reservations")
    .update({ status: "released" })
    .eq("id", reservation.reservationId);
}

async function replenishCreditsPartial(userId: string, amount: number): Promise<void> {
  // Add credits back (refund path) — direct increment, not full replenish
  await supabaseAdmin.rpc("add_credits", { p_user_id: userId, p_amount: amount });
}

export async function peekCreditBalance(userId: string): Promise<CreditCheckResult> {
  const bal = await getCreditBalance(userId);
  if (!bal) {
    return { allowed: false, balance: 0, cost: 0, planType: "free", reason: "user_not_found" };
  }
  return { allowed: true, balance: bal.balance, cost: 0, planType: bal.planType };
}
