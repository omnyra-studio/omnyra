import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { buildBrandBrainContext, generateCreatorInsights } from "@/lib/brand-brain/profile";
import { analyzeCreatorHistory, getBestSettings } from "@/lib/brand-brain/learning";
import { getPreferenceWeights, getRecentGenerations } from "@/lib/brand-brain/store";
import { supabaseAdmin } from "@/lib/supabase/admin";

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

  const userId = user.id;
  const url = new URL(req.url);
  const withInsights = url.searchParams.get("insights") !== "false";

  try {
    const [ctx, history, bestSettings, weights, recent, insights] = await Promise.all([
      buildBrandBrainContext(userId),
      analyzeCreatorHistory(userId),
      getBestSettings(userId),
      getPreferenceWeights(userId),
      getRecentGenerations(userId, 30),
      withInsights ? generateCreatorInsights(userId) : Promise.resolve(null),
    ]);

    // Credits used this month
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const { data: usageData } = await supabaseAdmin
      .from("usage_events")
      .select("credits_used, event_type, created_at")
      .eq("user_id", userId)
      .gte("created_at", monthStart.toISOString());

    const usageEvents = (usageData ?? []) as Array<{ credits_used: number; event_type: string; created_at: string }>;
    const creditsUsedThisMonth = usageEvents.reduce((s, e) => s + (e.credits_used ?? 0), 0);

    // Credit balance
    const { data: profileData } = await supabaseAdmin
      .from("profiles")
      .select("credits")
      .eq("id", userId)
      .maybeSingle();
    const creditsRemaining = (profileData as { credits?: number } | null)?.credits ?? null;

    // ROI: credits spent on videos that were published
    const publishedGenerations = recent.filter((g) => g.was_published);
    const totalGenerations = recent.length;
    const roiPublishRate = totalGenerations > 0 ? publishedGenerations.length / totalGenerations : 0;

    // Performance leaks: patterns with low publish rate (>= 3 uses, < 30% publish rate)
    const performanceLeaks: Array<{ type: string; key: string; publishRate: number; count: number }> = [];
    for (const h of history.topHooks) {
      if (h.count >= 3 && h.publishRate < 0.3) {
        performanceLeaks.push({ type: "hook", key: h.hook, publishRate: h.publishRate, count: h.count });
      }
    }
    for (const t of history.topTemplates) {
      if (t.count >= 3 && t.publishRate < 0.3) {
        performanceLeaks.push({ type: "template", key: t.template, publishRate: t.publishRate, count: t.count });
      }
    }

    // Content gap: pillars not represented in recent generations
    const recentNiches = new Set(recent.map((g) => g.niche).filter(Boolean));
    const contentPillars = ctx.contentPillars;
    const contentGaps = contentPillars.filter(
      (p) => !Array.from(recentNiches).some((n) => n?.toLowerCase().includes(p.toLowerCase())),
    );

    // Energy distribution for chart
    const energyChart = Object.entries(history.energyDistribution)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([level, count]) => ({ level: Number(level), count }));

    // Recent 7 days activity
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentWeek = recent.filter((g) => new Date(g.created_at) >= sevenDaysAgo);
    const weekPublished = recentWeek.filter((g) => g.was_published).length;

    return NextResponse.json({
      // Brand Brain context
      context: ctx,
      history: {
        totalGenerations: history.totalGenerations,
        publishRate: history.publishRate,
        editRate: history.editRate,
        avgRating: history.avgRating,
        topHooks: history.topHooks,
        topTemplates: history.topTemplates,
      },
      bestSettings,
      weights: {
        hookWeights: weights?.hook_weights ?? {},
        energyWeights: weights?.energy_weights ?? {},
        pacingWeights: weights?.pacing_weights ?? {},
        templateWeights: weights?.template_weights ?? {},
        topNiches: weights?.top_niches ?? [],
      },

      // Derived intelligence
      performanceLeaks,
      contentGaps,
      energyChart,

      // Credit / ROI
      creditsUsedThisMonth,
      creditsRemaining,
      roiPublishRate,

      // Week activity
      weekGenerations: recentWeek.length,
      weekPublished,

      // Claude insights (optional)
      insights,
    });
  } catch (err) {
    console.error("[brand-brain/analytics] GET error:", err);
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}
