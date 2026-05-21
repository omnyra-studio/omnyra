import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  try {
    const { code, userId } = await request.json();
    if (!code) return NextResponse.json({ error: "No code provided" }, { status: 400 });

    const { data: promo, error } = await supabase
      .from("promo_codes")
      .select("*")
      .eq("code", code.toUpperCase().trim())
      .eq("active", true)
      .single();

    if (error || !promo) {
      return NextResponse.json({ error: "Invalid or expired promo code" }, { status: 400 });
    }

    if (promo.uses_count >= promo.max_uses) {
      return NextResponse.json({ error: "Promo code has reached its limit" }, { status: 400 });
    }

    if (userId) {
      const { data: existing } = await supabase
        .from("promo_redemptions")
        .select("id")
        .eq("user_id", userId)
        .eq("code", code.toUpperCase().trim())
        .single();

      if (existing) {
        return NextResponse.json({ error: "You have already used this code" }, { status: 400 });
      }
    }

    return NextResponse.json({
      valid: true,
      code: promo.code,
      discount: promo.discount_percent,
      months: promo.duration_months,
      plan: promo.plan,
      message: `🎉 ${promo.duration_months} months of ${promo.plan} plan FREE!`
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
