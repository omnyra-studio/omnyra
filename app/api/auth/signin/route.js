import { NextResponse } from "next/server";
import { SignJWT } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.CRON_SECRET || "omnyra-secret-key"
);

async function findUser(email, password) {
  const adminEmail = process.env.ADMIN_EMAIL || "info@omnyra.studio";
  const adminPassword = process.env.ADMIN_PASSWORD || "changeme";
  if (email === adminEmail && password === adminPassword) {
    return { id: "1", email, name: "Admin", role: "admin" };
  }
  return null;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, password } = body;
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }
    const user = await findUser(email.toLowerCase().trim(), password);
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    const token = await new SignJWT({ sub: user.id, email: user.email, name: user.name, role: user.role })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(JWT_SECRET);
    const response = NextResponse.json({ success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
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
