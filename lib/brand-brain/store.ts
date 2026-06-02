/**
 * Brand Brain Store
 *
 * Low-level CRUD for generation_memory and preference_weights.
 * All reads/writes go through supabaseAdmin (server-only).
 */

import { supabaseAdmin } from "../supabase/admin";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GenerationRecord {
  id:                string;
  user_id:           string;
  hook_type:         string | null;
  energy_level:      number | null;
  pacing:            string | null;
  delivery_style:    string | null;
  template:          string | null;
  niche:             string | null;
  platform:          string | null;
  script_snippet:    string | null;
  video_url:         string | null;
  was_published:     boolean;
  was_edited:        boolean;
  user_rating:       number | null;    // 1-5 explicit rating, if given
  outcome_recorded:  boolean;
  created_at:        string;
  outcome_at:        string | null;
}

export type GenerationInput = Pick<
  GenerationRecord,
  "hook_type" | "energy_level" | "pacing" | "delivery_style" |
  "template" | "niche" | "platform" | "script_snippet" | "video_url"
>;

export interface PreferenceWeights {
  id:               string;
  user_id:          string;
  hook_weights:     Record<string, number>;    // hook_type → weight 0–1
  energy_weights:   Record<string, number>;    // "1"–"5" → weight
  pacing_weights:   Record<string, number>;    // slow/measured/fast → weight
  template_weights: Record<string, number>;    // template → weight
  top_niches:       string[];
  learning_rate:    number;
  updated_at:       string;
}

// ── Generation Memory ──────────────────────────────────────────────────────────

export async function recordGeneration(
  userId: string,
  input: GenerationInput,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("generation_memory")
    .insert({
      user_id:        userId,
      hook_type:      input.hook_type,
      energy_level:   input.energy_level,
      pacing:         input.pacing,
      delivery_style: input.delivery_style,
      template:       input.template,
      niche:          input.niche,
      platform:       input.platform,
      script_snippet: input.script_snippet?.substring(0, 300) ?? null,
      video_url:      input.video_url,
    })
    .select("id")
    .single();

  if (error) {
    console.warn("[brand-brain:store] recordGeneration error:", error.message);
    return null;
  }
  return data?.id ?? null;
}

export async function recordOutcome(
  userId: string,
  generationId: string,
  outcome: { was_published: boolean; was_edited: boolean; user_rating?: number },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("generation_memory")
    .update({
      was_published:    outcome.was_published,
      was_edited:       outcome.was_edited,
      user_rating:      outcome.user_rating ?? null,
      outcome_recorded: true,
      outcome_at:       new Date().toISOString(),
    })
    .eq("id", generationId)
    .eq("user_id", userId);

  if (error) {
    console.warn("[brand-brain:store] recordOutcome error:", error.message);
  }
}

export async function getRecentGenerations(
  userId: string,
  limit = 20,
): Promise<GenerationRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("generation_memory")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[brand-brain:store] getRecentGenerations error:", error.message);
    return [];
  }
  return (data ?? []) as GenerationRecord[];
}

export async function getPublishedGenerations(
  userId: string,
  limit = 50,
): Promise<GenerationRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("generation_memory")
    .select("*")
    .eq("user_id", userId)
    .eq("was_published", true)
    .order("outcome_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as GenerationRecord[];
}

// ── Preference Weights ─────────────────────────────────────────────────────────

export async function getPreferenceWeights(
  userId: string,
): Promise<PreferenceWeights | null> {
  const { data, error } = await supabaseAdmin
    .from("preference_weights")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[brand-brain:store] getPreferenceWeights error:", error.message);
    return null;
  }
  return data as PreferenceWeights | null;
}

export async function upsertPreferenceWeights(
  userId: string,
  weights: Partial<Omit<PreferenceWeights, "id" | "user_id" | "updated_at">>,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("preference_weights")
    .upsert(
      { user_id: userId, ...weights, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

  if (error) {
    console.warn("[brand-brain:store] upsertPreferenceWeights error:", error.message);
  }
}
