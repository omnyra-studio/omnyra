import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendWelcomeEmail } from "@/lib/email";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.CRON_SECRET || "omnyra-secret-key"
);

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

    const user = {
      id: data.user.id,
      email: data.user.email,
      name: name || data.user.email.split("@")[0],
      role: "free",
    };

    const jti = randomUUID();
    const token = await new SignJWT({ sub: user.id, email: user.email, name: user.name, role: user.role, jti })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(JWT_SECRET);

    const response = NextResponse.json({ success: true, user });
    response.cookies.set("omnyra_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return response;
  } catch (err) {
    return NextResponse.json({ error: err.message || "Signup failed" }, { status: 400 });
  }
}
