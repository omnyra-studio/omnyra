import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendWelcomeEmail } from "@/lib/email";

const log = (step, data) =>
  console.log(`[auth/signup] ${step}`, JSON.stringify(data));

export async function POST(request) {
  try {
    const body = await request.json();
    const { password, name } = body;
    // Normalize: trim whitespace + lowercase before any comparison or storage
    const email = typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : null;

    log("payload", { hasEmail: !!email, hasPassword: !!password, passwordLength: password?.length ?? 0 });

    if (!email || !password) {
      log("validation_failed", { reason: "missing_fields" });
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }
    if (password.length < 6) {
      log("validation_failed", { reason: "password_too_short" });
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    log("calling_createUser", { email });
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    console.error("[signup-api] Supabase error:", JSON.stringify(error));
    console.error("[signup-api] Supabase data:", JSON.stringify(data));

    if (error) {
      const isAlreadyRegistered = error.message.toLowerCase().includes("already");
      log("createUser_failed", { code: error.code, isAlreadyRegistered });
      const msg = isAlreadyRegistered ? "Email already registered" : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    log("createUser_ok", { userId: data.user.id, emailConfirmed: data.user.email_confirmed_at !== null });

    sendWelcomeEmail(email).catch(err =>
      console.error("[auth/signup] Welcome email failed:", err.message)
    );

    return NextResponse.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: name || data.user.email.split("@")[0],
        role: "free",
      },
    });
  } catch (err) {
    console.error("[auth/signup] Unhandled error:", err.message);
    return NextResponse.json({ error: err.message || "Signup failed" }, { status: 400 });
  }
}
