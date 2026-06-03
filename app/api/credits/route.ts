import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getCreditBalance } from "@/lib/db/credits";

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

  const bal = await getCreditBalance(user.id);
  if (!bal) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  return Response.json({
    balance:  bal.balance,
    planType: bal.planType,
  });
}
