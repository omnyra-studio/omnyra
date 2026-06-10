// Character Consistency Scorer.
//
// Measures how consistently a character's Hedra generations look across time.
// Score = average was_selected rate for this character's hedra clips (0-1).
// Persists result to consistency_scores table.
//
// Called after each completed parallel engine run.

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface ConsistencyResult {
  characterId:  string;
  score:        number;   // 0-1
  sampleSize:   number;
  confidence:   "low" | "medium" | "high";
  trend:        "improving" | "stable" | "declining" | "insufficient_data";
}

export async function scoreCharacterConsistency(
  characterId: string,
  userId:      string,
): Promise<ConsistencyResult> {
  // Pull last 20 completed Hedra generations for this character
  const { data: history } = await supabaseAdmin
    .from("generation_history")
    .select("was_selected, consistency_score, created_at")
    .eq("user_id", userId)
    .eq("character_id", characterId)
    .eq("provider", "hedra")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(20);

  if (!history || history.length < 2) {
    return {
      characterId,
      score:       1.0,
      sampleSize:  history?.length ?? 0,
      confidence:  "low",
      trend:       "insufficient_data",
    };
  }

  const rows = history as { was_selected: boolean; consistency_score: number | null; created_at: string }[];

  // Primary score: selection rate (user-validated quality signal)
  const selectionRate = rows.filter(r => r.was_selected).length / rows.length;

  // Secondary: VCE consistency scores where available
  const vceScores = rows.map(r => r.consistency_score).filter((s): s is number => s !== null);
  const avgVce    = vceScores.length ? vceScores.reduce((s, v) => s + v, 0) / vceScores.length : null;

  // Blend: 70% selection rate, 30% VCE (if available)
  const score = avgVce !== null
    ? selectionRate * 0.7 + avgVce * 0.3
    : selectionRate;

  // Trend: compare first half vs second half (older vs newer)
  const half    = Math.floor(rows.length / 2);
  const older   = rows.slice(half).filter(r => r.was_selected).length / (rows.length - half);
  const newer   = rows.slice(0, half).filter(r => r.was_selected).length / half;
  const delta   = newer - older;

  const trend =
    delta >  0.15 ? "improving"  :
    delta < -0.15 ? "declining"  :
                    "stable";

  const confidence =
    rows.length >= 10 ? "high"   :
    rows.length >= 5  ? "medium" :
                        "low";

  // Persist
  const { error: upsertErr } = await supabaseAdmin
    .from("consistency_scores")
    .upsert(
      {
        user_id:     userId,
        entity_type: "character",
        entity_id:   characterId,
        score,
        sample_size: rows.length,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "entity_type,entity_id" },
    );
  if (upsertErr) console.warn("[consistency-scorer] upsert error:", upsertErr.message);

  console.info("[consistency-scorer]", { characterId, score, trend, sampleSize: rows.length });

  return { characterId, score, sampleSize: rows.length, confidence, trend };
}

export async function getConsistencyScores(userId: string): Promise<Array<{
  entity_id:   string;
  entity_type: string;
  score:       number;
  sample_size: number;
  computed_at: string;
}>> {
  const { data } = await supabaseAdmin
    .from("consistency_scores")
    .select("entity_id, entity_type, score, sample_size, computed_at")
    .eq("user_id", userId)
    .order("computed_at", { ascending: false });

  return (data ?? []) as Array<{
    entity_id:   string;
    entity_type: string;
    score:       number;
    sample_size: number;
    computed_at: string;
  }>;
}
