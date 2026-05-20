import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { blacklistToken } from "@/app/lib/tokenBlacklist";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.CRON_SECRET || "omnyra-secret-key"
);

export async function POST(request) {
  try {
    const token = request.cookies.get("omnyra_token")?.value;
    if (token) {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      if (payload.jti) blacklistToken(payload.jti, payload.exp);
    }
  } catch {}
  const response = NextResponse.json({ success: true });
  response.cookies.set("omnyra_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
