// Character memory loader for the parallel orchestration engine.
//
// Enriches generation prompts with character identity data from character_registry.
// Provides voice settings for ElevenLabs and visual anchors for Kling/Hedra.

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface CharacterMemory {
  id:               string;
  name:             string;
  ref_frame_url:    string | null;  // Hedra image input
  core_prompt:      string;         // injected into Kling visual prompts
  visual_signature: string;         // secondary visual identifiers
  neg_prompt:       string;         // Kling negative prompt extension
  voice_id:         string | null;  // ElevenLabs voice override (from profiles or character)
  hasImage:         boolean;
}

// Prompt suffix appended to every Kling visual_prompt when character appears
export function buildKlingCharacterSuffix(char: CharacterMemory): string {
  const parts = [char.core_prompt];
  if (char.visual_signature.trim()) parts.push(char.visual_signature.trim());
  return parts.filter(Boolean).join(", ");
}

export async function loadCharacterMemory(
  characterId: string,
  userId:      string,
): Promise<CharacterMemory | null> {
  // Load character + user's default voice_id in one round-trip
  const [charRes, profileRes] = await Promise.all([
    supabaseAdmin
      .from("character_registry")
      .select("id, name, core_prompt, visual_signature, neg_prompt, ref_frame_url")
      .eq("id", characterId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("profiles")
      .select("voice_id")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  if (charRes.error || !charRes.data) return null;

  const char = charRes.data as {
    id: string;
    name: string;
    core_prompt: string;
    visual_signature: string;
    neg_prompt: string;
    ref_frame_url: string | null;
  };

  return {
    id:               char.id,
    name:             char.name,
    ref_frame_url:    char.ref_frame_url,
    core_prompt:      char.core_prompt,
    visual_signature: char.visual_signature,
    neg_prompt:       char.neg_prompt,
    voice_id:         (profileRes.data?.voice_id as string | null) ?? null,
    hasImage:         !!char.ref_frame_url,
  };
}

// ── Create / lookup ───────────────────────────────────────────────────────────

export interface CharacterUpsertInput {
  id?:               string;
  name?:             string;
  description?:      string;   // maps to core_prompt
  appearance?:       string;   // maps to visual_signature
  voiceStyle?:       string;   // informational — stored in neg_prompt note if no voice_id
  hedraReferenceId?: string;   // maps to ref_frame_url
  images?:           string[]; // images[0] used as ref_frame_url fallback
}

export async function getOrCreateCharacter(
  userId: string,
  input:  CharacterUpsertInput,
): Promise<CharacterMemory | null> {
  if (input.id) {
    const existing = await loadCharacterMemory(input.id, userId);
    if (existing) return existing;
  }

  const refFrameUrl = input.hedraReferenceId ?? input.images?.[0] ?? null;

  const { data, error } = await supabaseAdmin
    .from("character_registry")
    .insert({
      user_id:          userId,
      name:             input.name ?? "Character",
      core_prompt:      input.description ?? "",
      visual_signature: input.appearance ?? "",
      neg_prompt:       input.voiceStyle ? `voice style: ${input.voiceStyle}` : "",
      ref_frame_url:    refFrameUrl,
    })
    .select("id, name, core_prompt, visual_signature, neg_prompt, ref_frame_url")
    .single();

  if (error || !data) {
    console.error("[character-memory] insert error:", error?.message);
    return null;
  }

  const row = data as { id: string; name: string; core_prompt: string; visual_signature: string; neg_prompt: string; ref_frame_url: string | null };
  return {
    id:               row.id,
    name:             row.name,
    ref_frame_url:    row.ref_frame_url,
    core_prompt:      row.core_prompt,
    visual_signature: row.visual_signature,
    neg_prompt:       row.neg_prompt,
    voice_id:         null,
    hasImage:         !!row.ref_frame_url,
  };
}

export async function getUserCharacters(userId: string): Promise<CharacterMemory[]> {
  const [charsRes, profileRes] = await Promise.all([
    supabaseAdmin
      .from("character_registry")
      .select("id, name, core_prompt, visual_signature, neg_prompt, ref_frame_url")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("profiles")
      .select("voice_id")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  if (!charsRes.data?.length) return [];
  const voiceId = (profileRes.data?.voice_id as string | null) ?? null;

  return (charsRes.data as Array<{
    id: string; name: string; core_prompt: string;
    visual_signature: string; neg_prompt: string; ref_frame_url: string | null;
  }>).map(row => ({
    id:               row.id,
    name:             row.name,
    ref_frame_url:    row.ref_frame_url,
    core_prompt:      row.core_prompt,
    visual_signature: row.visual_signature,
    neg_prompt:       row.neg_prompt,
    voice_id:         voiceId,
    hasImage:         !!row.ref_frame_url,
  }));
}
