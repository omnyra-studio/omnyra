import { supabaseAdmin } from "@/lib/supabase/admin";

export interface GenerationRecord {
  id?: string;
  user_id: string;
  idea: string;
  niche?: string;
  platform?: string;
  variants: unknown;
  recommended_variant_id?: string;
  credits_used: number;
}

export async function saveGeneration(record: GenerationRecord): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("generations")
    .insert({
      user_id:               record.user_id,
      idea:                  record.idea,
      niche:                 record.niche ?? null,
      platform:              record.platform ?? null,
      variants:              record.variants,
      recommended_variant_id: record.recommended_variant_id ?? null,
      credits_used:          record.credits_used,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[db/generations] saveGeneration error:", error.message);
    return null;
  }

  return data?.id ?? null;
}

export async function saveVariantSelection(
  userId: string,
  generationId: string,
  selectedVariantId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("variant_selections")
    .insert({
      user_id:             userId,
      generation_id:       generationId,
      selected_variant_id: selectedVariantId,
    });

  if (error) {
    console.error("[db/generations] saveVariantSelection error:", error.message);
  }
}

export async function getGeneration(
  generationId: string,
  userId: string,
): Promise<GenerationRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("generations")
    .select("*")
    .eq("id", generationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[db/generations] getGeneration error:", error.message);
    return null;
  }

  return data as GenerationRecord | null;
}
