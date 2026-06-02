import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { buildBrandBrainContext, generateCreatorInsights } from "@/lib/brand-brain/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const withInsights = url.searchParams.get("insights") === "true";

  try {
    if (withInsights) {
      const [ctx, insights] = await Promise.all([
        buildBrandBrainContext(user.id),
        generateCreatorInsights(user.id),
      ]);
      return NextResponse.json({ context: ctx, insights });
    }

    const ctx = await buildBrandBrainContext(user.id);
    return NextResponse.json({ context: ctx });
  } catch (err) {
    console.error("[brand-brain/profile] GET error:", err);
    return NextResponse.json({ error: "Failed to build brand brain context" }, { status: 500 });
  }
}
