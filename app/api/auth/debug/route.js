import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase-admin";

// GET /api/auth/debug — non-secret connectivity probe for auth troubleshooting.
// Returns structured diagnostics: env presence, Supabase reachability, session state, profiles table.
// Never logs or returns secret key values.
export async function GET(request) {
  const results = {};

  // 1. Env presence (values masked)
  results.env = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabase_url_preview: process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/\/.*@/, "//***@") ?? null,
  };

  // 2. Caller's session state (server-validated)
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() { return request.cookies.getAll(); },
          setAll() {},
        },
      }
    );
    const { data: { user }, error } = await supabase.auth.getUser();
    results.caller_session = {
      authenticated: !!user,
      user_id: user?.id ?? null,
      email_confirmed: user?.email_confirmed_at != null,
      error: error?.message ?? null,
    };
  } catch (e) {
    results.caller_session = { error: e.message };
  }

  // 3. Admin client reachability — list 1 user to confirm service role works
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    results.admin_client = {
      reachable: !error,
      user_count_sample: data?.users?.length ?? 0,
      error: error?.message ?? null,
    };
  } catch (e) {
    results.admin_client = { reachable: false, error: e.message };
  }

  // 4. profiles table existence
  try {
    const { error } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .limit(1);
    results.profiles_table = {
      exists: !error,
      error: error?.message ?? null,
      hint: error?.hint ?? null,
    };
  } catch (e) {
    results.profiles_table = { exists: false, error: e.message };
  }

  // 5. credits table existence
  try {
    const { error } = await supabaseAdmin
      .from("credits")
      .select("user_id")
      .limit(1);
    results.credits_table = {
      exists: !error,
      error: error?.message ?? null,
    };
  } catch (e) {
    results.credits_table = { exists: false, error: e.message };
  }

  // 6. brand_profiles table existence
  try {
    const { error } = await supabaseAdmin
      .from("brand_profiles")
      .select("id")
      .limit(1);
    results.brand_profiles_table = {
      exists: !error,
      error: error?.message ?? null,
    };
  } catch (e) {
    results.brand_profiles_table = { exists: false, error: e.message };
  }

  const allOk = results.admin_client?.reachable &&
    results.profiles_table?.exists &&
    results.credits_table?.exists;

  return NextResponse.json({ ok: allOk, diagnostics: results }, { status: 200 });
}
