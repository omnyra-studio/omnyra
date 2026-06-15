/**
 * lib/user-memory.ts — Unified Omnyra User Memory System
 *
 * Persistent memory across all video sessions:
 *   - Brand voice, visual style, recurring characters
 *   - Behavioral patterns (Ghost Test compliant — observable actions only)
 *   - Audience insights from performance data
 *   - Ready-to-inject context strings for all AI generation calls
 *
 * Ghost Test enforcement: all character traits and audience patterns are stored
 * as observable behaviors, never as emotion labels.
 *
 * Usage:
 *   const memory = await loadUserMemory(userId);
 *   const ctx    = buildMemoryContext(memory);    // inject into AI prompts
 *   await updateMemoryFromGeneration(userId, data); // call after each generation
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CharacterBehavior {
  id:              string;      // character_registry UUID
  name:            string;
  physicalTraits:  string;      // face, body, age, style — observable only
  behavioralNotes: string;      // how they move, gesture, hold objects — Ghost Test
  voiceId?:        string;      // ElevenLabs voice ID
  refImageUrl?:    string;      // reference image for Kling i2v
  lastSeen?:       string;      // ISO date last used in a generation
}

export interface AudiencePattern {
  platform:       string;
  keepsWatching:  string[];     // what behavioral moments retained viewers
  drops:          string[];     // what caused drop-off (timing, pacing, etc.)
  recommendations: string[];   // next-content behavioral direction
  updatedAt:      string;
}

export interface UserMemory {
  userId:           string;
  // Brand identity
  brandName:        string | null;
  brandTone:        string | null;     // e.g. "warm and direct, conversational pace"
  visualStyle:      string | null;     // e.g. "teal-orange grade, shallow depth of field"
  niche:            string | null;
  // Characters
  characters:       CharacterBehavior[];
  // Audience behavioral intelligence (Ghost Test)
  audiencePatterns: AudiencePattern[];
  // Injected context strings (pre-built for speed)
  brandContext:     string;            // ready for system prompt injection
  characterContext: string;            // character consistency anchor for image/video prompts
  audienceContext:  string;            // behavioral direction for script/brief generation
  // Meta
  lastUpdated:      string | null;
}

const EMPTY_MEMORY: UserMemory = {
  userId:           "",
  brandName:        null,
  brandTone:        null,
  visualStyle:      null,
  niche:            null,
  characters:       [],
  audiencePatterns: [],
  brandContext:     "",
  characterContext: "",
  audienceContext:  "",
  lastUpdated:      null,
};

// ── Load ──────────────────────────────────────────────────────────────────────

export async function loadUserMemory(userId: string): Promise<UserMemory> {
  const [brandRes, charactersRes, audienceRes] = await Promise.all([
    supabaseAdmin
      .from("brand_profiles")
      .select("brand_name, tone_of_voice, style_preset, niche, content_style_notes")
      .eq("user_id", userId)
      .maybeSingle(),

    supabaseAdmin
      .from("character_registry")
      .select("id, name, core_prompt, visual_signature, ref_frame_url, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(5),

    supabaseAdmin
      .from("creator_memory")
      .select("content, metadata, created_at")
      .eq("user_id", userId)
      .eq("memory_type", "audience_insights")
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const brand = brandRes.data;
  const chars = charactersRes.data ?? [];
  const insights = audienceRes.data ?? [];

  // Build characters array — Ghost Test: behavioralNotes from core_prompt + visual_signature
  const characters: CharacterBehavior[] = chars.map(c => ({
    id:              c.id as string,
    name:            c.name ?? "Character",
    physicalTraits:  (c.core_prompt as string) ?? "",
    behavioralNotes: (c.visual_signature as string) ?? "",
    refImageUrl:     (c.ref_frame_url as string | null) ?? undefined,
    lastSeen:        c.updated_at as string,
  }));

  // Build audience patterns from AI insights stored in creator_memory
  const audiencePatterns: AudiencePattern[] = insights.map(row => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const ai   = meta.ai_insights as Record<string, string[]> | null;
    return {
      platform:        (meta.platform as string) ?? "unknown",
      keepsWatching:   ai?.do_more_of          ?? [],
      drops:           ai?.avoid_or_test        ?? [],
      recommendations: ai?.next_content_recommendations ?? [],
      updatedAt:       row.created_at as string,
    };
  });

  // Pre-build injection strings
  const brandContext = buildBrandContext(brand, chars.length);
  const characterContext = buildCharacterContext(characters);
  const audienceContext = buildAudienceContext(audiencePatterns);

  return {
    userId,
    brandName:    brand?.brand_name ?? null,
    brandTone:    brand?.tone_of_voice ?? null,
    visualStyle:  brand?.style_preset ?? null,
    niche:        brand?.niche ?? null,
    characters,
    audiencePatterns,
    brandContext,
    characterContext,
    audienceContext,
    lastUpdated:  chars[0]?.updated_at ?? insights[0]?.created_at ?? null,
  };
}

// ── Context builders ──────────────────────────────────────────────────────────

function buildBrandContext(
  brand: { brand_name?: string | null; tone_of_voice?: string | null; style_preset?: string | null; niche?: string | null; content_style_notes?: string | null } | null,
  characterCount: number,
): string {
  if (!brand) return "";
  const parts: string[] = [];
  if (brand.brand_name)        parts.push(`Brand: ${brand.brand_name}`);
  if (brand.niche)             parts.push(`Niche: ${brand.niche}`);
  if (brand.tone_of_voice)     parts.push(`Tone: ${brand.tone_of_voice}`);
  if (brand.style_preset)      parts.push(`Visual style: ${brand.style_preset}`);
  if (brand.content_style_notes) parts.push(`Style notes: ${brand.content_style_notes}`);
  if (characterCount > 0)      parts.push(`${characterCount} registered character(s) available for consistency`);
  return parts.length ? `\n[BRAND MEMORY]\n${parts.join("\n")}\n` : "";
}

function buildCharacterContext(characters: CharacterBehavior[]): string {
  if (!characters.length) return "";
  const primary = characters[0];
  const lines = [
    `[CHARACTER CONSISTENCY — GHOST TEST COMPLIANT]`,
    `Primary character: ${primary.name}`,
    `Physical description: ${primary.physicalTraits}`,
  ];
  if (primary.behavioralNotes) {
    lines.push(`Observable behavioral patterns: ${primary.behavioralNotes}`);
  }
  if (primary.refImageUrl) {
    lines.push(`Reference image available: yes`);
  }
  lines.push(`Rule: Use this exact description in every scene. Never change the character's appearance or substitute another.`);
  return `\n${lines.join("\n")}\n`;
}

function buildAudienceContext(patterns: AudiencePattern[]): string {
  if (!patterns.length) return "";
  const latest = patterns[0];
  const lines = [`[AUDIENCE BEHAVIORAL INTELLIGENCE — from real performance data]`];
  if (latest.keepsWatching.length) {
    lines.push(`What keeps viewers watching: ${latest.keepsWatching.join(" | ")}`);
  }
  if (latest.drops.length) {
    lines.push(`What causes drop-off: ${latest.drops.join(" | ")}`);
  }
  if (latest.recommendations.length) {
    lines.push(`Direction for next content: ${latest.recommendations[0]}`);
  }
  return `\n${lines.join("\n")}\n`;
}

/**
 * Builds a full memory context string ready to inject into any AI system prompt.
 * Includes brand + character + audience intelligence.
 */
export function buildMemoryContext(memory: UserMemory): string {
  return [memory.brandContext, memory.characterContext, memory.audienceContext]
    .filter(Boolean)
    .join("");
}

// ── Update ────────────────────────────────────────────────────────────────────

export interface MemoryUpdateInput {
  type:     "character_appearance" | "brand_voice" | "audience_pattern" | "behavioral_note";
  content:  string;    // Ghost Test: observable physical behavior only, no emotion labels
  metadata?: Record<string, unknown>;
}

/**
 * Stores a new memory entry. Ghost Test enforced by convention — callers must
 * describe observable behavior, not internal states.
 *
 * Examples of valid content:
 *  "Character holds the product at waist height, tilts it 45 degrees toward camera"
 *  "Audience retention spiked during 3-second pause before character speaks"
 *
 * Examples of INVALID content (violates Ghost Test):
 *  "Character looks excited"   ← emotion label
 *  "Audience loved this part"  ← subjective/emotional
 */
export async function updateMemoryFromGeneration(
  userId: string,
  input:  MemoryUpdateInput,
): Promise<void> {
  try {
    await supabaseAdmin.from("creator_memory").insert({
      user_id:     userId,
      memory_type: input.type,
      content:     input.content,
      metadata:    { ...input.metadata, ghost_test_compliant: true },
    });
  } catch (err) {
    console.warn("[user-memory] updateMemoryFromGeneration failed (non-fatal):", err);
  }
}

/**
 * Writes a full memory snapshot after a successful generation.
 * Captures character consistency data and any new behavioral patterns.
 */
export async function snapshotAfterGeneration(
  userId:      string,
  characterId: string | null,
  promptUsed:  string,
  outputUrl:   string,
): Promise<void> {
  if (!characterId) return;

  await updateMemoryFromGeneration(userId, {
    type:    "behavioral_note",
    content: `Generated video with character ${characterId}. Prompt used: ${promptUsed.slice(0, 200)}`,
    metadata: { characterId, outputUrl, source: "auto_snapshot" },
  });
}
