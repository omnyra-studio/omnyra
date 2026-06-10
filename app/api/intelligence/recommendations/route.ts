// GET  /api/intelligence/recommendations        — list active recommendations
// POST /api/intelligence/recommendations        — regenerate recommendations
// POST /api/intelligence/recommendations/act    — mark acted on
// POST /api/intelligence/recommendations/dismiss — dismiss

import { createServerClient } from "@supabase/ssr";
import { cookies }            from "next/headers";
import { NextResponse }       from "next/server";
import { generateRecommendations } from "@/lib/intelligence/recommendation-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const supabase    = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("intelligence_recommendations")
    .select("id, rec_type, headline, detail, confidence, was_acted_on, shown_at")
    .eq("user_id", user.id)
    .eq("was_dismissed", false)
    .order("confidence", { ascending: false })
    .limit(5);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ recommendations: data ?? [] });
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase    = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { action?: string; id?: string } = {};
  try { body = await request.json(); } catch { /* no body is fine */ }

  // Mark as acted on
  if (body.action === "act" && body.id) {
    await supabase
      .from("intelligence_recommendations")
      .update({ was_acted_on: true, acted_at: new Date().toISOString() })
      .eq("id", body.id)
      .eq("user_id", user.id);
    return NextResponse.json({ ok: true });
  }

  // Dismiss
  if (body.action === "dismiss" && body.id) {
    await supabase
      .from("intelligence_recommendations")
      .update({ was_dismissed: true })
      .eq("id", body.id)
      .eq("user_id", user.id);
    return NextResponse.json({ ok: true });
  }

  // Regenerate — run analysis and return fresh recommendations
  const recs = await generateRecommendations(user.id);
  return NextResponse.json({ recommendations: recs });
}
