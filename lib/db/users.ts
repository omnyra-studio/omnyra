import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PlanType } from "@/lib/stripe/plans";

export interface OmnyraUser {
  id: string;
  email: string;
  plan: PlanType;
  credits: number;
  created_at: string;
}

export async function getUserById(userId: string): Promise<OmnyraUser | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, plan, credits, created_at")
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
    .from("profiles")
    .select("id, email, plan, credits, created_at")
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
    .from("profiles")
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
    .from("profiles")
    .update({ plan, credits: creditsBalance })
    .eq("id", userId);

  if (error) {
    console.error("[db/users] setUserPlan error:", error.message);
  }
}
