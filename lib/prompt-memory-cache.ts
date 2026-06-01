import { supabaseAdmin } from "./supabase/admin";

export interface CachedPrompt {
  id: string;
  shot_type: string;
  emotion: string;
  visual_prompt: string;
  success_score: number;
  usage_count: number;
}

const REUSE_SCORE_THRESHOLD = 0.8;

/**
 * Look up a cached visual prompt for a given user, shot type, and emotion.
 * Returns the highest-scoring cached prompt if its score >= 0.8, else null.
 */
export async function lookupCachedPrompt(
  userId: string,
  shotType: string,
  emotion: string,
): Promise<CachedPrompt | null> {
  const { data } = await supabaseAdmin
    .from("prompt_memory_cache")
    .select("id, shot_type, emotion, visual_prompt, success_score, usage_count")
    .eq("user_id", userId)
    .eq("shot_type", shotType)
    .eq("emotion", emotion)
    .gte("success_score", REUSE_SCORE_THRESHOLD)
    .order("success_score", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data as CachedPrompt | null;
}

/**
 * Persist a successful visual prompt to the cache.
 * On conflict (same user + shot_type + emotion + prompt text), increments
 * usage_count and updates the score rather than inserting a duplicate.
 */
export async function cachePrompt(
  userId: string,
  shotType: string,
  emotion: string,
  visualPrompt: string,
  successScore = 1.0,
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from("prompt_memory_cache")
    .select("id, usage_count, success_score")
    .eq("user_id", userId)
    .eq("shot_type", shotType)
    .eq("emotion", emotion)
    .eq("visual_prompt", visualPrompt)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from("prompt_memory_cache")
      .update({
        usage_count:   existing.usage_count + 1,
        // Exponential moving average of success score: blends new score with history
        success_score: parseFloat(((existing.success_score * 0.7) + (successScore * 0.3)).toFixed(4)),
        updated_at:    new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await supabaseAdmin
      .from("prompt_memory_cache")
      .insert({
        user_id:       userId,
        shot_type:     shotType,
        emotion:       emotion,
        visual_prompt: visualPrompt,
        success_score: successScore,
        usage_count:   1,
      });
  }
}

/**
 * Record a failed prompt (score = 0) so future lookups avoid it.
 * Only updates rows that are already in the cache for this exact prompt.
 */
export async function markPromptFailed(
  userId: string,
  shotType: string,
  emotion: string,
  visualPrompt: string,
): Promise<void> {
  await supabaseAdmin
    .from("prompt_memory_cache")
    .update({
      success_score: 0.0,
      updated_at:    new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("shot_type", shotType)
    .eq("emotion", emotion)
    .eq("visual_prompt", visualPrompt);
}
