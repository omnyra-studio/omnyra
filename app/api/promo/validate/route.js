/* POST /api/promo/validate
 *
 * Read-only check against the canonical single-use schema.
 * Mirrors the REWARDS map and the `used_by` semantics from
 * /api/promo/redeem/route.ts — single source of truth.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Must stay in sync with REWARDS in app/api/promo/redeem/route.ts
const REWARDS = {
  BETAPRO1:     { plan: "pro",     months: 1, bonus_credits: 200 },
  BETACREATOR2: { plan: "creator", months: 2, bonus_credits: 100 },
};

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ valid: false, error: "invalid_json" }, { status: 400 });
  }

  const raw = typeof body?.code === "string" ? body.code.trim() : "";
  if (!raw) {
    return NextResponse.json({ valid: false, error: "no_code" }, { status: 400 });
  }
  const code = raw.toUpperCase();

  const reward = REWARDS[code];
  if (!reward) {
    return NextResponse.json({ valid: false, error: "invalid_code" }, { status: 404 });
  }

  const { data: promo } = await supabaseAdmin
    .from("promo_codes")
    .select("id, code, used_by")
    .eq("code", code)
    .maybeSingle();

  if (!promo) {
    return NextResponse.json({ valid: false, error: "invalid_code" }, { status: 404 });
  }
  if (promo.used_by) {
    return NextResponse.json({ valid: false, error: "already_used" }, { status: 409 });
  }

  return NextResponse.json({
    valid: true,
    code,
    plan: reward.plan,
    months: reward.months,
    bonus_credits: reward.bonus_credits,
    message: `🎉 ${reward.months} months of ${reward.plan} plan + ${reward.bonus_credits} credits`,
  });
}
