// Creator profile — read/write basic brand identity data.
// Reinforcement/learning functions removed in pre-launch cleanup.
// Only static profile data (tone, style, preferences) remains.

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
