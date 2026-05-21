import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { code, userId } = await request.json();
    if (!code || !userId) {
      return NextResponse.json({ error: "Code and userId required" }, { status: 400 });
    }

    const { data: promo } = await supabase
      .from("promo_codes")
      .select("*")
      .eq("code", code.toUpperCase().trim())
      .eq("active", true)
      .single();

    if (!promo) return NextResponse.json({ error: "Invalid code" }, { status: 400 });

    await supabase.from("promo_redemptions").insert({
      user_id: userId,
      code: code.toUpperCase().trim()
    });

    await supabase
      .from("promo_codes")
      .update({ uses_count: promo.uses_count + 1 })
      .eq("id", promo.id);

    return NextResponse.json({
      success: true,
      message: `✅ Code applied! You have ${promo.duration_months} months of ${promo.plan} plan free.`
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
