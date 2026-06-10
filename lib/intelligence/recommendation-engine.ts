// Intelligence Recommendation Engine.
//
// Generates data-driven recommendations from the user's generation_history.
// Three analysis types (minimum 3 data points each to be confident):
//   1. Best-performing tool combo (Hedra+Kling vs solo)
//   2. Optimal Kling clip duration
//   3. Character voice match degradation
//
// Returns recommendations sorted by confidence desc.
// Persists to intelligence_recommendations table.

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface Recommendation {
  id?:             string;
  rec_type:        "tool_combo" | "duration" | "character_setting" | "prompt_style";
  headline:        string;
  detail:          string;
  confidence:      number;   // 0-1
  uplift_estimate?: string;
}

interface ProviderStat {
  provider:         string;
  total_generations: number;
  selection_rate:   number;
  avg_generation_ms: number | null;
  avg_user_rating:  number | null;
}

interface DurationStat {
  bucket:         string;
  selection_rate: number;
  avg_rating:     number | null;
  n:              number;
}

export async function generateRecommendations(userId: string): Promise<Recommendation[]> {
  const recs: Recommendation[] = [];

  // Fetch aggregated provider stats from performance_memory
  const { data: providerStats } = await supabaseAdmin
    .from("performance_memory")
    .select("dimension_value, total_generations, selection_rate, avg_generation_ms, avg_user_rating")
    .eq("user_id", userId)
    .eq("dimension", "provider")
    .order("selection_rate", { ascending: false });

  if (providerStats && providerStats.length >= 2) {
    // performance_memory stores the value in dimension_value; map to provider field
    const stats = (providerStats as { dimension_value: string; total_generations: number; successful_generations: number; selection_rate: number; avg_generation_ms: number | null; avg_user_rating: number | null }[])
      .map(p => ({ provider: p.dimension_value, ...p })) as ProviderStat[];
    const best   = stats[0];
    const second = stats[1];

    if (best.total_generations >= 3 && second.total_generations >= 3) {
      const upliftPct = second.selection_rate > 0
        ? Math.round(((best.selection_rate - second.selection_rate) / second.selection_rate) * 100)
        : 0;

      if (upliftPct > 15) {
        recs.push({
          rec_type:        "tool_combo",
          headline:        `${best.provider} outperforms by ${upliftPct}%`,
          detail:          `You approve ${Math.round(best.selection_rate * 100)}% of ${best.provider} clips vs ${Math.round(second.selection_rate * 100)}% for ${second.provider}. Based on ${best.total_generations} generations.`,
          confidence:      Math.min(best.total_generations / 10, 1),
          uplift_estimate: `${upliftPct}% more clips selected`,
        });
      }
    }
  }

  // Kling duration analysis from generation_history
  // Try optional RPC first; fall back to direct query if it doesn't exist
  let durationRows: unknown[] | null = null;
  try {
    const rpcResult = await supabaseAdmin.rpc("get_kling_duration_stats", { p_user_id: userId });
    durationRows = rpcResult.data ?? null;
  } catch { durationRows = null; }

  // Fallback: direct query if RPC doesn't exist yet
  if (!durationRows) {
    const { data: rawHistory } = await supabaseAdmin
      .from("generation_history")
      .select("duration_seconds, was_selected, user_rating")
      .eq("user_id", userId)
      .eq("provider", "kling")
      .eq("status", "completed");

    if (rawHistory && rawHistory.length >= 6) {
      const bucketMap: Record<string, { selected: number; total: number; ratings: number[] }> = {};

      for (const row of rawHistory as { duration_seconds: number; was_selected: boolean; user_rating: number | null }[]) {
        const bucket =
          row.duration_seconds < 10 ? "<10s" :
          row.duration_seconds < 20 ? "10-20s" :
          row.duration_seconds <= 40 ? "20-40s" : "40s+";

        if (!bucketMap[bucket]) bucketMap[bucket] = { selected: 0, total: 0, ratings: [] };
        bucketMap[bucket].total++;
        if (row.was_selected) bucketMap[bucket].selected++;
        if (row.user_rating) bucketMap[bucket].ratings.push(row.user_rating);
      }

      const buckets: DurationStat[] = Object.entries(bucketMap)
        .filter(([, v]) => v.total >= 3)
        .map(([bucket, v]) => ({
          bucket,
          selection_rate: v.selected / v.total,
          avg_rating:     v.ratings.length ? v.ratings.reduce((s, r) => s + r, 0) / v.ratings.length : null,
          n:              v.total,
        }))
        .sort((a, b) => b.selection_rate - a.selection_rate);

      if (buckets.length >= 2 && buckets[0].selection_rate > buckets[1].selection_rate * 1.2) {
        recs.push({
          rec_type:   "duration",
          headline:   `Your best Kling clips are ${buckets[0].bucket}`,
          detail:     `You approve ${Math.round(buckets[0].selection_rate * 100)}% of ${buckets[0].bucket} Kling clips vs ${Math.round(buckets[1].selection_rate * 100)}% for ${buckets[1].bucket}. Consider setting default duration accordingly.`,
          confidence: Math.min(buckets[0].n / 10, 1),
        });
      }
    }
  }

  // Character voice analysis
  const { data: voiceHistory } = await supabaseAdmin
    .from("generation_history")
    .select("character_id, model_id, was_selected, user_rating")
    .eq("user_id", userId)
    .eq("provider", "elevenlabs")
    .eq("status", "completed")
    .not("character_id", "is", null)
    .limit(50);

  if (voiceHistory && voiceHistory.length >= 5) {
    const voiceRows = voiceHistory as { character_id: string; model_id: string; was_selected: boolean; user_rating: number | null }[];
    const byVoice: Record<string, { selected: number; total: number }> = {};

    for (const row of voiceRows) {
      const key = `${row.character_id}::${row.model_id}`;
      if (!byVoice[key]) byVoice[key] = { selected: 0, total: 0 };
      byVoice[key].total++;
      if (row.was_selected) byVoice[key].selected++;
    }

    const voiceStats = Object.entries(byVoice)
      .filter(([, v]) => v.total >= 2)
      .map(([key, v]) => ({ key, rate: v.selected / v.total, n: v.total }))
      .sort((a, b) => b.rate - a.rate);

    if (voiceStats.length >= 2 && voiceStats[0].rate > voiceStats[1].rate * 1.3) {
      const [charId, voiceModel] = voiceStats[0].key.split("::");
      recs.push({
        rec_type:   "character_setting",
        headline:   `Voice model "${voiceModel.slice(0, 20)}" performs best`,
        detail:     `This voice gets ${Math.round(voiceStats[0].rate * 100)}% approval for this character (${voiceStats[0].n} samples) vs ${Math.round(voiceStats[1].rate * 100)}% for others.`,
        confidence: Math.min(voiceStats[0].n / 5, 1),
      });
      void charId;
    }
  }

  // Sort by confidence desc
  recs.sort((a, b) => b.confidence - a.confidence);

  // Persist recommendations (upsert by headline to avoid duplication)
  if (recs.length > 0) {
    const { error: upsertErr } = await supabaseAdmin
      .from("intelligence_recommendations")
      .upsert(
        recs.map(r => ({
          user_id:    userId,
          rec_type:   r.rec_type,
          headline:   r.headline,
          detail:     r.detail,
          confidence: r.confidence,
          shown_at:   new Date().toISOString(),
        })),
        { onConflict: "user_id,headline", ignoreDuplicates: true },
      );
    if (upsertErr) console.warn("[recommendations] persist error:", upsertErr.message);
  }

  return recs;
}
