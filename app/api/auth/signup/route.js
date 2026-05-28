import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendWelcomeEmail } from "@/lib/email";
import { trackEvent } from "@/lib/events/trackEvent";

const log = (step, data) =>
  console.log(`[auth/signup] ${step}`, JSON.stringify(data));

export async function POST(request) {
  // ── 1. Parse + validate input ────────────────────────────────────────────
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }

  const { password, name, firstName, lastName, promo_code } = body;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
  const displayName = firstName && lastName
    ? `${firstName.trim()} ${lastName.trim()}`
    : name || null;

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  // ── 2. Supabase client ───────────────────────────────────────────────────
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    console.error("[auth/signup] Missing Supabase env vars");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  const supabase = createClient(url, key);

  // ── 3. Promo code validation ─────────────────────────────────────────────
  const promoCode = (promo_code || "").trim().toUpperCase();
  if (!promoCode) {
    return NextResponse.json({ error: "Beta access code is required" }, { status: 400 });
  }

  let promoData = null;
  try {
    const { data } = await supabase
      .from("promo_codes")
      .select("*")
      .eq("code", promoCode)
      .eq("active", true)
      .single();
    promoData = data;
  } catch (err) {
    console.error("[auth/signup] promo_lookup_error", err.message);
  }

  if (!promoData) {
    return NextResponse.json({ error: "Invalid beta code — request access at info@omnyra.studio" }, { status: 400 });
  }
  if ((promoData.uses_count ?? 0) >= (promoData.max_uses ?? Infinity)) {
    return NextResponse.json({ error: "Beta is full — join the waitlist at info@omnyra.studio" }, { status: 400 });
  }

  // ── 4. Create auth user ──────────────────────────────────────────────────
  log("calling_createUser", { email });
  let userData;
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName?.trim() || null,
        last_name: lastName?.trim() || null,
        full_name: displayName,
      },
    });
    if (error) {
      const msg = error.message.toLowerCase().includes("already")
        ? "Email already registered"
        : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    userData = data.user;
  } catch (err) {
    console.error("[auth/signup] createUser_exception", err.message);
    return NextResponse.json({ error: err.message || "Signup failed" }, { status: 400 });
  }

  log("createUser_ok", { userId: userData.id });

  // ── 5. Resolve plan + credits ────────────────────────────────────────────
  const planCreditsMap = { creator: 350, studio: 900, starter: 100, free: 30 };
  const resolvedPlan    = promoData?.plan ?? "free";
  console.log("[auth/signup] resolvedPlan:", resolvedPlan, "from promoData.plan:", promoData?.plan);
  const resolvedCredits = promoData.credits_granted
    ?? promoData.bonus_credits
    ?? planCreditsMap[resolvedPlan]
    ?? 30;

  console.log("[auth/signup] Promo result:", resolvedPlan, "-> credits:", resolvedCredits);

  // ── 6. Profile upsert — NEVER crash signup after this point ─────────────
  try {
    console.log('[signup] UPSERT PAYLOAD:', { id: userData.id, email, plan: resolvedPlan, credits: resolvedCredits });
    const { error: upsertError } = await supabase.from("profiles").upsert({
      id: userData.id,
      email,
      first_name: firstName?.trim() || null,
      last_name:  lastName?.trim()  || null,
      plan: resolvedPlan,
      credits: resolvedCredits,
      created_at: new Date().toISOString(),
    });
    if (upsertError) {
      console.error("[auth/signup] profile_upsert_error", JSON.stringify(upsertError));
    }
  } catch (err) {
    console.error("[auth/signup] profile_upsert_exception", err.message);
  }

  // ── 7. Increment uses_count — fire-and-forget ────────────────────────────
  try {
    await supabase
      .from("promo_codes")
      .update({ uses_count: (promoData.uses_count ?? 0) + 1 })
      .eq("code", promoCode);
  } catch (err) {
    console.error("[auth/signup] promo_increment_error", err.message);
  }

  // ── 8. Side-effects — fire-and-forget ────────────────────────────────────
  trackEvent(userData.id, "user_signed_up", {
    email, name: displayName || null, signup_source: "password", promo_code: promoCode,
  }).catch(err => console.error("[auth/signup] event emit failed:", err.message));

  sendWelcomeEmail(email)
    .catch(err => console.error("[auth/signup] welcome email failed:", err.message));

  // ── 9. Always return 200 once user is created ────────────────────────────
  return NextResponse.json({
    success: true,
    user: {
      id: userData.id,
      email: userData.email,
      name: displayName || userData.email.split("@")[0],
      role: resolvedPlan,
    },
  });
}
