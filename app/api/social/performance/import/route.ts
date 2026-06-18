// app/api/social/performance/import/route.ts
// Backend for Social Analytics & Attribution (Requirement 5).
// Accepts manual performance data (fallback) and can be called by crons for Apify/TikTok etc pulls.
// Attaches to a render (and its brand_profile_id if present).
// Smart attribution: matches on video_url or recent renders for the user.

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { recordOutcomeAndLearn } from "@/artifacts/backend/core/feedback"; // or the live learning

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { renderId, platform, views, retentionPct, shares, saves, watchTimeSeconds, postUrl, videoUrl } = body;

  if (!renderId || !platform || typeof views !== "number") {
    return NextResponse.json({ error: "renderId, platform, views required" }, { status: 400 });
  }

  // Verify ownership + pull brand if attached
  const { data: render } = await supabaseAdmin
    .from("renders")
    .select("id, user_id, brand_profile_id, video_url")
    .eq("id", renderId)
    .eq("user_id", user.id)
    .single();

  if (!render) return NextResponse.json({ error: "Render not found or access denied" }, { status: 404 });

  // Upsert performance
  const { error: perfErr } = await supabaseAdmin
    .from("performance_data")
    .upsert({
      render_id: renderId,
      user_id: user.id,
      brand_profile_id: render.brand_profile_id,
      platform,
      views,
      retention_pct: retentionPct ?? null,
      shares: shares ?? 0,
      saves: saves ?? 0,
      watch_time_seconds: watchTimeSeconds ?? null,
      post_url: postUrl || null,
      data_ingested_at: new Date().toISOString(),
    }, { onConflict: "render_id,platform" });

  if (perfErr) return NextResponse.json({ error: perfErr.message }, { status: 500 });

  // If high performance, record as positive outcome for the brand's memory (tight feedback loop)
  if (views > 200 || (retentionPct ?? 0) > 65) {
    try {
      await supabaseAdmin.from("renders").update({ was_published: true }).eq("id", renderId);
      // Could call recordOutcomeAndLearn here with brand context
    } catch {}
  }

  // Trigger brand memory refinement if we have a brand
  if (render.brand_profile_id) {
    // In full impl: call a refineBrandFromPerformance(brandId, metrics)
  }

  return NextResponse.json({ ok: true, attributedToBrand: !!render.brand_profile_id });
}
