import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendWelcomeEmail } from "@/lib/email";

export async function POST(request) {
  try {
    const { email, password, name } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      const msg = error.message.toLowerCase().includes("already")
        ? "Email already registered"
        : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    sendWelcomeEmail(email).catch(err =>
      console.error("[email] Welcome email failed:", err.message)
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
    return NextResponse.json({ error: err.message || "Signup failed" }, { status: 400 });
  }
}
