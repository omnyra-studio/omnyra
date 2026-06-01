import { supabaseAdmin } from "./supabase/admin";

export interface Character {
  id: string;
  user_id: string;
  name: string;
  core_prompt: string;
  visual_signature: string;
  neg_prompt: string;
  ref_frame_url: string | null;
  created_at: string;
  updated_at: string;
}

export async function loadCharacter(characterId: string): Promise<Character | null> {
  const { data } = await supabaseAdmin
    .from("character_registry")
    .select("*")
    .eq("id", characterId)
    .maybeSingle();
  return data as Character | null;
}

export async function updateCharacterRefFrame(
  characterId: string,
  refFrameUrl: string,
): Promise<void> {
  await supabaseAdmin
    .from("character_registry")
    .update({ ref_frame_url: refFrameUrl, updated_at: new Date().toISOString() })
    .eq("id", characterId);
}

/**
 * Builds the prompt suffix to append to every scene's visualPrompt.
 * Format: "<core_prompt>[, <visual_signature>]"
 */
export function buildCharacterPromptSuffix(character: Character): string {
  const parts = [character.core_prompt];
  if (character.visual_signature.trim()) parts.push(character.visual_signature.trim());
  return parts.join(", ");
}
