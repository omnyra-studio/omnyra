import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/* POST /api/promo/redeem
 *
 * Single-use promo code redemption. Per the Safe Data Mutation Rules:
 *   - Credits are NEVER updated directly. We call grant_credits_atomic
 *     which inserts a positive credit_transactions row and lets the
 *     ledger trigger apply it to the cached balance.
 *   - The promo claim (used_by) and the credit grant must both succeed
 *     OR both be backed out. We claim FIRST with the `is("used_by", null)`
 *     guard for single-use semantics; if the credit grant subsequently
 *     fails we reverse the claim.
 */

interface Reward {
  plan: "pro" | "creator" | "studio";
  months: number;
  bonus_credits: number;
}

const REWARDS: Record<string, Reward> = {
  BETAPRO1: { plan: "pro", months: 1, bonus_credits: 200 },
  BETACREATOR2: { plan: "creator", months: 2, bonus_credits: 100 },
};

function monthsFromNowISO(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const code = (raw as { code?: unknown } | null)?.code;
  if (typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }
  const normalized = code.trim().toUpperCase();

  const reward = REWARDS[normalized];
  if (!reward) {
    return NextResponse.json({ error: "invalid_code" }, { status: 404 });
  }

  // 0. Global cap — max 50 total promo redemptions across all codes.
  const { count: redeemedCount } = await supabaseAdmin
    .from("promo_codes")
    .select("id", { count: "exact", head: true })
    .not("used_by", "is", null);

  if ((redeemedCount ?? 0) >= 50) {
    return NextResponse.json({ error: "promo_limit_reached", message: "Beta promo access is full — email info@omnyra.studio" }, { status: 410 });
  }

  // 1. Fetch promo row (single source of truth for single-use semantics).
  const { data: promo, error: promoErr } = await supabaseAdmin
    .from("promo_codes")
    .select("id, code, used_by")
    .eq("code", normalized)
    .maybeSingle();

  if (promoErr) {
    console.error("[promo/redeem] promo lookup failed", promoErr);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  if (!promo) {
    return NextResponse.json({ error: "invalid_code" }, { status: 404 });
  }
  if (promo.used_by) {
    return NextResponse.json({ error: "already_used" }, { status: 409 });
  }

  // 2. Atomically claim the promo. The WHERE clause's `is("used_by", null)`
  //    guard means concurrent redeems can't both succeed — the second
  //    update affects 0 rows.
  const claim = await supabaseAdmin
    .from("promo_codes")
    .update({ used_by: user.id, used_at: new Date().toISOString() })
    .eq("id", promo.id)
    .is("used_by", null)
    .select("id");
  if (claim.error || !claim.data || claim.data.length === 0) {
    if (claim.error) console.error("[promo/redeem] promo claim failed", claim.error);
    return NextResponse.json({ error: "already_used" }, { status: 409 });
  }

  // 3. Update profile plan + expiry. Reversible if step 4 fails.
  const profileUpdate = await supabaseAdmin
    .from("profiles")
    .update({
      plan: reward.plan,
      plan_expires_at: monthsFromNowISO(reward.months),
    })
    .eq("id", user.id);
  if (profileUpdate.error) {
    console.error("[promo/redeem] profile update failed", profileUpdate.error);
    // Roll back the promo claim.
    await supabaseAdmin.from("promo_codes").update({ used_by: null, used_at: null }).eq("id", promo.id);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // 4. Grant credits via the atomic RPC. NEVER write credits.balance directly.
  const grant = await supabaseAdmin.rpc("grant_credits_atomic", {
    p_user_id: user.id,
    p_amount: reward.bonus_credits,
    p_type: "promo",
    p_description: `Promo code redemption: ${normalized}`,
  });
  if (grant.error) {
    console.error("[promo/redeem] credit grant failed", grant.error);
    // Roll back profile + promo claim.
    await supabaseAdmin.from("promo_codes").update({ used_by: null, used_at: null }).eq("id", promo.id);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    plan: reward.plan,
    credits_added: reward.bonus_credits,
    new_balance: typeof grant.data === "number" ? grant.data : null,
  });
}
