import { supabaseAdmin } from "@/lib/supabase/admin";

export interface CreditBalance {
  balance: number;
  planType: string;
}

export async function getCreditBalance(userId: string): Promise<CreditBalance | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("credits_balance, plan_type")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    balance: data.credits_balance,
    planType: data.plan_type,
  };
}

/**
 * Atomic credit deduction via the SQL function `deduct_credits()`.
 * Returns true if deduction succeeded (user had enough credits), false if insufficient.
 * Never allows negative balances — enforced at the database level.
 */
export async function deductCreditsAtomic(
  userId: string,
  amount: number,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("deduct_credits", {
    p_user_id: userId,
    p_amount: amount,
  });

  if (error) {
    console.error("[db/credits] deductCreditsAtomic error:", error.message);
    return false;
  }

  return data === true;
}

/**
 * Replenish credits to a fixed amount (used on billing cycle renewal).
 * Does NOT add to existing balance — it resets to the plan allocation.
 */
export async function replenishCredits(
  userId: string,
  creditsAmount: number,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("users")
    .update({ credits_balance: creditsAmount })
    .eq("id", userId);

  if (error) {
    console.error("[db/credits] replenishCredits error:", error.message);
  }
}

export async function hasEnoughCredits(
  userId: string,
  required: number,
): Promise<boolean> {
  const bal = await getCreditBalance(userId);
  return (bal?.balance ?? 0) >= required;
}
