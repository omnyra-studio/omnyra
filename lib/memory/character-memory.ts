// Character memory loader for the parallel orchestration engine.
//
// Enriches generation prompts with character identity data from character_registry.
// Provides voice settings for ElevenLabs and visual anchors for Kling/Hedra.
// Manages character_references: multiple reference images per character used as
// Kling i2v input frames for visual consistency across cinematic scenes.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { fal }           from "@fal-ai/client";
import { scoreReferenceQuality } from "./video-quality-scorer";

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

// ── Reference image management ────────────────────────────────────────────────

export interface CharacterReference {
  id:           string;
  image_url:    string;
  source:       string;
  pose_label:   string | null;
  is_primary:   boolean;
  quality_score: number;
  created_at:   string;
}

/** Returns the best reference image URL for a character (primary > newest). */
export async function findBestReference(
  characterId: string,
  userId: string,
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("character_references")
    .select("image_url")
    .eq("character_id", characterId)
    .eq("user_id", userId)
    .order("is_primary",    { ascending: false })
    .order("quality_score", { ascending: false })
    .order("created_at",    { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as { image_url: string } | null)?.image_url ?? null;
}

/** Returns all reference images for a character, newest first. */
export async function getCharacterReferences(
  characterId: string,
  userId: string,
  limit = 12,
): Promise<CharacterReference[]> {
  const { data } = await supabaseAdmin
    .from("character_references")
    .select("id, image_url, source, pose_label, is_primary, quality_score, created_at")
    .eq("character_id", characterId)
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as CharacterReference[];
}

/** Saves a new reference image for a character. */
export async function saveNewReference(
  characterId: string,
  userId: string,
  imageUrl: string,
  source: "flux_sheet" | "kling_frame" | "user_upload",
  poseLabel?: string,
  isPrimary = false,
  qualityScore = 0.8,
): Promise<CharacterReference | null> {
  const { data, error } = await supabaseAdmin
    .from("character_references")
    .insert({
      character_id:  characterId,
      user_id:       userId,
      image_url:     imageUrl,
      source,
      pose_label:    poseLabel ?? null,
      is_primary:    isPrimary,
      quality_score: qualityScore,
    })
    .select("id, image_url, source, pose_label, is_primary, quality_score, created_at")
    .single();

  if (error) {
    console.error("[character-memory] saveNewReference error:", error.message);
    return null;
  }
  return data as CharacterReference;
}

// Reference sheet pose definitions — 3 Flux images covering key emotional states
const REFERENCE_POSES: Array<{ label: string; suffix: string; isPrimary: boolean }> = [
  {
    label:     "front",
    suffix:    "front-facing portrait, direct eye contact, neutral-to-warm expression, photorealistic, cinematic lighting, 9:16 vertical",
    isPrimary: true,
  },
  {
    label:     "emotional",
    suffix:    "three-quarter profile, slightly downcast expression, soft vulnerability, tear on cheek or near eyes, golden hour lighting, emotional cinematic",
    isPrimary: false,
  },
  {
    label:     "tender",
    suffix:    "gentle soft smile, warm eyes, slight head tilt, intimate close-up, golden hour rim light, tender and peaceful expression",
    isPrimary: false,
  },
];

/**
 * Generates a 3-image Flux reference sheet for a character.
 * Saves all images to character_references. Updates ref_frame_url on the character registry.
 * Returns the primary (front-facing) reference URL.
 */
export async function generateReferenceSheet(
  characterId: string,
  userId: string,
): Promise<{ primaryUrl: string; allUrls: string[] } | null> {
  const falKey = process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY ?? process.env.FAL_KEY;
  if (!falKey) {
    console.error("[character-memory] generateReferenceSheet: FAL_API_KEY not set");
    return null;
  }
  fal.config({ credentials: falKey });

  // Load character for prompt base
  const { data: char, error: charErr } = await supabaseAdmin
    .from("character_registry")
    .select("id, core_prompt, visual_signature")
    .eq("id", characterId)
    .eq("user_id", userId)
    .maybeSingle();

  if (charErr || !char) {
    console.error("[character-memory] generateReferenceSheet: character not found", charErr?.message);
    return null;
  }

  const row = char as { id: string; core_prompt: string; visual_signature: string };
  const charDesc = [row.core_prompt, row.visual_signature].filter(Boolean).join(", ");
  const allUrls: string[] = [];
  let primaryUrl: string | null = null;

  // Generate all 3 poses in parallel
  const results = await Promise.allSettled(
    REFERENCE_POSES.map(async (pose) => {
      const prompt = [
        charDesc,
        pose.suffix,
        "authentic photorealistic person, natural skin texture, not airbrushed, documentary feel",
      ].join(", ");

      console.log(`[CHAR_REF_SHEET] charId=${characterId} pose=${pose.label} prompt="${prompt.substring(0, 100)}"`);

      const result = await (fal as unknown as { subscribe: (model: string, opts: Record<string, unknown>) => Promise<unknown> })
        .subscribe("fal-ai/flux/dev", {
          input: {
            prompt,
            image_size:            { width: 720, height: 1280 },
            num_inference_steps:   28,
            num_images:            1,
            enable_safety_checker: true,
          },
          logs: false,
        });

      const r = result as { images?: Array<{ url: string }>; data?: { images?: Array<{ url: string }> } };
      const url = r?.images?.[0]?.url ?? r?.data?.images?.[0]?.url;
      if (!url) throw new Error(`[char-ref-sheet] pose=${pose.label} no URL returned`);
      return { pose, url };
    }),
  );

  // Score and persist successful results
  await Promise.allSettled(
    results.map(async (result) => {
      if (result.status !== "fulfilled") {
        console.warn("[char-ref-sheet] pose failed:", result.reason);
        return;
      }
      const { pose, url } = result.value;
      allUrls.push(url);
      if (pose.isPrimary) primaryUrl = url;

      // Score reference quality before saving (non-blocking fall-through to 0.85 default)
      const quality = await scoreReferenceQuality(url).catch(() => null);
      const qualityScore = quality?.score ?? 0.85;
      console.log(`[REF_QUALITY] pose=${pose.label} score=${qualityScore.toFixed(2)} approved=${quality?.isApproved ?? true}`);

      await saveNewReference(characterId, userId, url, "flux_sheet", pose.label, pose.isPrimary, qualityScore);
      console.log(`[CHAR_REF_SHEET] saved pose=${pose.label} isPrimary=${pose.isPrimary} quality=${qualityScore.toFixed(2)} url=${url.substring(0, 60)}`);
    }),
  );

  if (!primaryUrl && allUrls.length > 0) primaryUrl = allUrls[0];
  if (!primaryUrl) {
    console.error("[char-ref-sheet] all poses failed for charId=", characterId);
    return null;
  }

  // Update character registry ref_frame_url to the primary image
  await supabaseAdmin
    .from("character_registry")
    .update({ ref_frame_url: primaryUrl, updated_at: new Date().toISOString() })
    .eq("id", characterId)
    .eq("user_id", userId);

  console.log(`[CHAR_REF_SHEET] complete charId=${characterId} primary=${primaryUrl.substring(0, 60)} total=${allUrls.length}`);
  return { primaryUrl, allUrls };
}

/**
 * Returns up to `limit` best approved references for a character (primary first, then newest).
 * Convenience alias for getCharacterReferences with semantically clearer name.
 */
export async function getBestReferences(
  characterId: string,
  userId: string,
  limit = 3,
): Promise<CharacterReference[]> {
  return getCharacterReferences(characterId, userId, limit);
}

/**
 * Saves a consistency-scored generated frame as a new character reference.
 * Only persists if score meets the minimum quality bar (default 0.7).
 * Returns the saved reference, or null if score is too low or save fails.
 */
export async function saveGeneratedClipAsReference(
  characterId:  string,
  userId:       string,
  imageUrl:     string,
  consistencyScore: number,
  minScore = 0.70,
): Promise<CharacterReference | null> {
  if (consistencyScore < minScore) {
    console.log(`[CHAR_REF_SAVE] skipped — score=${consistencyScore.toFixed(2)} below min=${minScore}`);
    return null;
  }
  return saveNewReference(
    characterId, userId, imageUrl,
    "kling_frame", "generated",
    false,
    Math.min(consistencyScore, 0.9),
  );
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
