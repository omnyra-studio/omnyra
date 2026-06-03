import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getUserById } from "@/lib/db/users";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getUserById(user.id);
  if (!profile) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  return Response.json({
    id:             profile.id,
    email:          profile.email,
    planType:       profile.plan_type,
    creditsBalance: profile.credits_balance,
    createdAt:      profile.created_at,
  });
}
