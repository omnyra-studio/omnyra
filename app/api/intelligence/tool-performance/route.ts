// GET /api/intelligence/tool-performance
//
// Returns aggregated Hedra / Kling / ElevenLabs performance stats for the
// current user. Reads from performance_memory (trigger-maintained) and
// generation_history tables.
//
// Response: { providers: ProviderStat[], consistency: ConsistencyScore[], memorySummary }

import { createServerClient } from "@supabase/ssr";
import { cookies }            from "next/headers";
import { NextResponse }       from "next/server";
import { getConsistencyScores } from "@/lib/intelligence/consistency-scorer";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const supabase    = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [perfData, consistencyData, memorySummary] = await Promise.all([
    // Provider performance from performance_memory (auto-aggregated by trigger)
    supabase
      .from("performance_memory")
      .select("dimension_value, total_generations, successful_generations, selection_rate, avg_generation_ms, avg_user_rating, last_updated")
      .eq("user_id", user.id)
      .eq("dimension", "provider")
      .order("total_generations", { ascending: false }),

    // Character consistency scores
    getConsistencyScores(user.id),

    // Memory footprint: cached assets + saved credits estimate
    supabase
      .from("character_hedra_assets")
      .select("id", { count: "exact", head: true })
      .gt("expires_at", new Date().toISOString())
      .then(r => ({ hedra_cached_assets: r.count ?? 0 })),
  ]);

  // Enrich with recent generation counts per provider (last 30d)
  const { data: recentCounts } = await supabase
    .from("generation_history")
    .select("provider")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .gte("created_at", new Date(Date.now() - 30 * 24 * 3_600_000).toISOString());

  const recentByProvider: Record<string, number> = {};
  if (recentCounts) {
    for (const row of recentCounts as { provider: string }[]) {
      recentByProvider[row.provider] = (recentByProvider[row.provider] ?? 0) + 1;
    }
  }

  const providers = (perfData.data ?? []).map(p => ({
    provider:              p.dimension_value as string,
    total_generations:     p.total_generations as number,
    successful_generations: p.successful_generations as number,
    selection_rate:        p.selection_rate as number,
    avg_generation_ms:     p.avg_generation_ms as number | null,
    avg_user_rating:       p.avg_user_rating as number | null,
    recent_30d:            recentByProvider[p.dimension_value as string] ?? 0,
    last_updated:          p.last_updated as string,
  }));

  return NextResponse.json({
    providers,
    consistency:   consistencyData,
    memorySummary: {
      ...(memorySummary as { hedra_cached_assets: number }),
      recent_by_provider: recentByProvider,
    },
  });
}
