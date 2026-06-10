/**
 * POST /api/referrals/apply
 *
 * Apply a referral code at sign-up. Grants credits to both the new user
 * and the referrer. Idempotent — one-time use per user.
 *
 * Body: { code: string }
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";

const REFERRER_BONUS  = 50;  // credits granted to the person who referred
const REFEREE_BONUS   = 25;  // credits granted to the new user signing up

async function grantCredits(userId: string, amount: number, description: string) {
  await supabaseAdmin.rpc("add_credits", { p_user_id: userId, p_amount: amount });
  await supabaseAdmin.from("credit_transactions").insert({
    user_id:     userId,
    amount,
    type:        "referral",
    description,
  });
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { code?: string };
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const code = (body.code ?? "").trim().toUpperCase();
  if (!code) return Response.json({ error: "code required" }, { status: 400 });

  // Check if this user already used a referral code
  const { data: already } = await supabaseAdmin
    .from("referral_uses")
    .select("id")
    .eq("referee_id", user.id)
    .single();

  if (already) {
    return Response.json({ error: "You have already used a referral code" }, { status: 409 });
  }

  // Look up the referral code
  const { data: referral } = await supabaseAdmin
    .from("referral_codes")
    .select("id, user_id, uses")
    .eq("code", code)
    .single();

  if (!referral) {
    return Response.json({ error: "Invalid referral code" }, { status: 404 });
  }

  // Cannot refer yourself
  if (referral.user_id === user.id) {
    return Response.json({ error: "You cannot use your own referral code" }, { status: 400 });
  }

  // Record the use atomically
  const { error: useErr } = await supabaseAdmin.from("referral_uses").insert({
    referral_code_id: referral.id,
    referrer_id:      referral.user_id,
    referee_id:       user.id,
  });

  if (useErr) {
    return Response.json({ error: "Failed to record referral" }, { status: 500 });
  }

  // Grant credits to both parties
  await Promise.all([
    grantCredits(user.id, REFEREE_BONUS, `Referral bonus — joined via code ${code}`),
    grantCredits(referral.user_id, REFERRER_BONUS, `Referral reward — ${user.email ?? "someone"} joined with your code`),
    supabaseAdmin.from("referral_codes")
      .update({ uses: referral.uses + 1, credits_granted: referral.uses * REFERRER_BONUS + REFERRER_BONUS })
      .eq("id", referral.id),
  ]);

  console.log(`[referrals] applied code=${code} referee=${user.id} referrer=${referral.user_id}`);

  return Response.json({
    success:       true,
    credits_added: REFEREE_BONUS,
    message:       `You and your referrer each earned bonus credits.`,
  });
}
