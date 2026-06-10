/**
 * POST /api/referrals/create
 *
 * Generate a referral code for the authenticated user.
 * Returns existing code if one already exists.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Check if code already exists
  const { data: existing } = await supabaseAdmin
    .from("referral_codes")
    .select("code, uses, credits_granted")
    .eq("user_id", user.id)
    .single();

  if (existing) {
    return Response.json({ code: existing.code, uses: existing.uses, credits_granted: existing.credits_granted });
  }

  // Generate a unique 8-char code
  const code = generateCode(user.id);

  const { data, error } = await supabaseAdmin
    .from("referral_codes")
    .insert({ user_id: user.id, code })
    .select("code, uses, credits_granted")
    .single();

  if (error || !data) {
    return Response.json({ error: "Failed to create referral code" }, { status: 500 });
  }

  return Response.json({ code: data.code, uses: data.uses, credits_granted: data.credits_granted });
}

function generateCode(userId: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seed = userId.replace(/-/g, "").slice(0, 8);
  let code = "";
  for (let i = 0; i < 8; i++) {
    const idx = parseInt(seed[i] ?? "0", 16) % chars.length;
    code += chars[idx];
  }
  // Append random suffix for uniqueness in case of collisions
  for (let i = code.length; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
