import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.CRON_SECRET || "omnyra-secret-key"
);

export async function POST(request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const adminEmail = process.env.ADMIN_EMAIL || "info@omnyra.studio";
    const adminPassword = process.env.ADMIN_PASSWORD || "changeme";
    let user;

    if (email.toLowerCase().trim() === adminEmail && password === adminPassword) {
      user = { id: "admin-1", email: adminEmail, name: "Admin", role: "admin" };
    } else {
      const { data, error } = await supabaseAdmin.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      });
      if (error || !data.user) {
        return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
      }
      user = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name || data.user.email.split("@")[0],
        role: data.user.user_metadata?.role || "free",
      };
    }

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
    console.error("[signin] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
