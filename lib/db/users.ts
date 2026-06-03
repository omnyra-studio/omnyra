import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PlanType } from "@/lib/stripe/plans";

export interface OmnyraUser {
  id: string;
  email: string;
  plan_type: PlanType;
  credits_balance: number;
  created_at: string;
}

export async function getUserById(userId: string): Promise<OmnyraUser | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, email, plan_type, credits_balance, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[db/users] getUserById error:", error.message);
    return null;
  }
  return data as OmnyraUser | null;
}

export async function getUserByEmail(email: string): Promise<OmnyraUser | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, email, plan_type, credits_balance, created_at")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error("[db/users] getUserByEmail error:", error.message);
    return null;
  }
  return data as OmnyraUser | null;
}

export async function upsertUser(
  userId: string,
  email: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("users")
    .upsert({ id: userId, email }, { onConflict: "id", ignoreDuplicates: true });

  if (error) {
    console.error("[db/users] upsertUser error:", error.message);
  }
}

export async function setUserPlan(
  userId: string,
  plan: PlanType,
  creditsBalance: number,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("users")
    .update({ plan_type: plan, credits_balance: creditsBalance })
    .eq("id", userId);

  if (error) {
    console.error("[db/users] setUserPlan error:", error.message);
  }
}
