import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { isBlacklisted } from "@/app/lib/tokenBlacklist";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.CRON_SECRET || "omnyra-secret-key"
);

export async function GET(request) {
  try {
    const token = request.cookies.get("omnyra_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.jti && isBlacklisted(payload.jti)) {
      return NextResponse.json({ error: "Token has been revoked" }, { status: 401 });
    }
    return NextResponse.json({
      user: { id: payload.sub, email: payload.email, name: payload.name, role: payload.role }
    });
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
}
