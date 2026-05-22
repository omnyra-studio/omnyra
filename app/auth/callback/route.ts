import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/* OAuth + magic-link callback.
 *
 * Exchanges the `code` for a session, then routes the user to /welcome
 * if they haven't finished onboarding, or /dashboard if they have.
 */

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const explicitNext = url.searchParams.get("next");
  const origin = url.origin;

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const signin = new URL("/signin", origin);
      signin.searchParams.set("error", "callback_failed");
      return NextResponse.redirect(signin);
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/signin", origin));
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("has_completed_onboarding")
    .eq("id", user.id)
    .maybeSingle();

  const target =
    explicitNext && explicitNext.startsWith("/")
      ? explicitNext
      : profile?.has_completed_onboarding === true
        ? "/dashboard"
        : "/welcome";

  return NextResponse.redirect(new URL(target, origin));
}
