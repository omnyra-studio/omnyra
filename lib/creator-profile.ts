import { supabaseAdmin } from "./supabase/admin";

export interface CreatorProfile {
  id: string;
  user_id: string;
  niche: string | null;
  audience_type: string | null;
  communication_style: string;
  pacing: string;
  preferred_hooks: string[];
  preferred_ctas: string[];
  content_pillars: string[];
  visual_style: string | null;
  brand_colors: string[];
  quality_score: number;
  total_videos: number;
}

export async function loadCreatorProfile(userId: string): Promise<CreatorProfile | null> {
  try {
    const { data } = await supabaseAdmin
      .from("creator_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    return data as CreatorProfile | null;
  } catch {
    return null;
  }
}

export async function upsertCreatorProfile(
  userId: string,
  fields: Partial<Omit<CreatorProfile, "id" | "user_id">>,
): Promise<void> {
  await supabaseAdmin
    .from("creator_profiles")
    .upsert(
      { user_id: userId, ...fields, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
}

/**
 * Reinforce a hook type that was used in a published video.
 * Called by the quality loop when was_published=true AND user_edit_count=0.
 */
export async function reinforceHookPattern(userId: string, hookType: string): Promise<void> {
  const profile = await loadCreatorProfile(userId);
  if (!profile) return;
  const hooks = profile.preferred_hooks ?? [];
  if (!hooks.includes(hookType)) {
    await upsertCreatorProfile(userId, { preferred_hooks: [...hooks, hookType] });
  }
}

/**
 * Increment total_videos and recompute quality_score after a video publishes.
 * quality_score is a rolling average: higher = more videos published without edits.
 */
export async function recordVideoOutcome(
  userId: string,
  wasPublished: boolean,
  wasEdited: boolean,
): Promise<void> {
  const profile = await loadCreatorProfile(userId);
  if (!profile) return;

  const total   = profile.total_videos + 1;
  const success = wasPublished && !wasEdited ? 1 : 0;
  // Exponential moving average: alpha=0.2 keeps last ~5 videos influential
  const score   = profile.quality_score * 0.8 + success * 0.2;

  await upsertCreatorProfile(userId, {
    total_videos:  total,
    quality_score: Math.round(score * 1000) / 1000,
  });
}
