/* Server-only auth helpers. Uses the admin (service_role) client to
 * validate Bearer tokens issued by Supabase. Never import from the browser.
 */

import { supabaseAdmin } from "./supabase/admin";

export async function getUserAndPlan(request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!token) {
    console.log("[auth] getUserAndPlan: no Bearer token in Authorization header");
    return { user: null, plan: "free" };
  }

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) {
    console.log("[auth] getUserAndPlan: token validation failed", { code: userError?.code });
    return { user: null, plan: "free" };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();

  if (profileError && profileError.code !== "PGRST116") {
    console.log("[auth] getUserAndPlan: profiles lookup error", {
      code: profileError.code,
      message: profileError.message,
    });
  }

  return { user, plan: profile?.plan ?? "free" };
}
