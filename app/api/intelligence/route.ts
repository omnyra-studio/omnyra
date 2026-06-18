// app/api/intelligence/route.ts
// Backend API delivering the Intelligence star feature data.
// Call with ?brandId=xxx for per-brand depth.
// Returns everything needed for heatmaps, viral analysis, predictions, proven library, etc.
// No visual changes — pure data + strong disclaimers.

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { generateIntelligenceReport, predictForPrompt } from "@/artifacts/backend/core/intelligence/engine"; // or copy logic to lib/ if preferred

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
  const brandId = url.searchParams.get("brandId") || undefined;
  const days = parseInt(url.searchParams.get("days") || "90", 10);
  const predict = url.searchParams.get("predict") === "true";
  const prompt = url.searchParams.get("prompt") || "";

  try {
    const report = await generateIntelligenceReport(user.id, {
      brandProfileId: brandId,
      days,
    });

    let prediction = null;
    if (predict && prompt) {
      prediction = await predictForPrompt(user.id, prompt, brandId);
    }

    return NextResponse.json({
      ...report,
      prediction,
      privacyNote: "Performance predictions and aggregates are estimates only. They are not guarantees of results on any platform. Data usage respects your consent settings in brand profile.",
      disclaimer: "All 'why it worked' analysis uses only observable signals (retention curves, share actions, scroll behavior) per Ghost Test principles. Never emotional claims.",
    });
  } catch (err: any) {
    console.error("[intelligence] error", err);
    return NextResponse.json({ error: "Failed to compute intelligence" }, { status: 500 });
  }
}
