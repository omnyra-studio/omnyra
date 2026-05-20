import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll() {},
      },
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || user.email.split("@")[0],
      role: user.user_metadata?.role || "free",
    },
  });
}
