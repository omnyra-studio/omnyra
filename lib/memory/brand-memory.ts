// Brand memory loader for orchestration engines.
//
// Pulls brand context from brand_brain. Falls back gracefully if absent.
// Provides two suffix types:
//   klingStyleSuffix — appended to Kling video prompts (motion-aware)
//   fluxStyleSuffix  — appended to Flux image prompts (visual description)
//   negativeStyleSuffix — appended to negative prompts (brand exclusions)

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface SocialPlatformEntry {
  platform: string;
  handle:   string;
  url:      string;
}

// ── Brand Memory Layer — Layer 1 of 3-layer memory system ────────────────────
// Controls character identity and global visual rules.
// Injected into EVERY scene prompt. Never affects UI.

export interface BrandCharacter {
  character_id:    string;         // "char_001"
  name:            string;
  face_embeddings: string[];       // reference image URLs
  appearance_lock: string;         // "blue jacket, black jeans, short brown hair"
  age_lock:        string;         // "mid 20s"
  body_type_lock:  string;         // "lean athletic"
}

export interface GlobalVisualRules {
  style:           string;   // "cinematic realism"
  lighting:        string;   // "roger deakins golden hour soft contrast"
  color_grade:     string;   // "teal orange cinematic"
  fps:             number;
  camera_language: string;   // "slow cinematic tracking, shallow depth of field"
}

export interface BrandMemory {
  brandName:           string | null;
  toneKeywords:        string[];
  visualStyle:         string | null;
  tagline:             string | null;
  preferredHooks:      string[];
  negativeTerms:       string[];
  performanceSummary:  string | null;
  klingStyleSuffix:    string;   // ready-to-append Kling prompt fragment
  fluxStyleSuffix:     string;   // ready-to-append Flux image prompt fragment
  negativeStyleSuffix: string;   // ready-to-append negative prompt fragment
  socialPlatforms:     SocialPlatformEntry[];
  socialContext:       string;
  // Layer 1 extensions
  characters:          BrandCharacter[];
  globalVisualRules:   GlobalVisualRules;
  forbiddenChanges:    string[];  // e.g. "no face drift", "no outfit changes unless defined"
}

// ── Brand Memory injection builder ───────────────────────────────────────────
// Produces the BRAND LOCK block injected into every scene prompt.

export function buildBrandMemoryInjection(mem: BrandMemory): string {
  const parts: string[] = [];

  if (mem.characters.length > 0) {
    const charLines = mem.characters.map(c =>
      `${c.name}: ${c.appearance_lock}, ${c.age_lock}, ${c.body_type_lock}. ` +
      (c.face_embeddings.length > 0 ? `Reference images: ${c.face_embeddings.length} provided.` : ""),
    ).join(" | ");
    parts.push(`CHARACTERS: ${charLines}`);
  }

  const vr = mem.globalVisualRules;
  if (vr.style) {
    parts.push(
      `VISUAL LOCK: ${vr.style}. Lighting: ${vr.lighting}. ` +
      `Color: ${vr.color_grade}. Camera: ${vr.camera_language}.`,
    );
  }

  if (mem.forbiddenChanges.length > 0) {
    parts.push(`FORBIDDEN: ${mem.forbiddenChanges.join("; ")}.`);
  }

  return parts.filter(Boolean).join("\n");
}

const DEFAULT_GLOBAL_VISUAL_RULES: GlobalVisualRules = {
  style:           "cinematic realism",
  lighting:        "Roger Deakins golden hour, soft high-contrast shadows",
  color_grade:     "teal orange cinematic grade",
  fps:             24,
  camera_language: "slow cinematic tracking, shallow depth of field",
};

// ── FIX: centralized suffix builders (deduped, used across engines)
function buildKlingStyleSuffix(visualStyle: string | null, toneKeywords: string[] | null): string {
  const parts: string[] = [];
  if (visualStyle) parts.push(visualStyle);
  if (toneKeywords?.length) parts.push(toneKeywords.slice(0, 3).join(", "));
  return parts.filter(Boolean).join(", ");
}
function buildFluxStyleSuffix(visualStyle: string | null, toneKeywords: string[] | null): string {
  const parts: string[] = [];
  if (visualStyle) parts.push(visualStyle);
  if (toneKeywords?.length) {
    const visualTone = toneKeywords.filter(t => !/\b(energetic|dynamic|fast|motion|movement)\b/i.test(t)).slice(0, 2);
    if (visualTone.length) parts.push(visualTone.join(", "));
  }
  return parts.filter(Boolean).join(", ");
}
function buildNegativeStyleSuffix(negativeTerms: string[] | null): string {
  return (negativeTerms || []).filter(Boolean).join(", ");
}
function deriveToneKeywords(toneOfVoice?: string | null, toneTags?: string[] | null, notes?: string | null): string[] {
  const kws: string[] = [];
  if (toneOfVoice) kws.push(...toneOfVoice.split(/[,;]+/).map(s => s.trim()).filter(Boolean));
  if (toneTags?.length) kws.push(...toneTags);
  if (notes) {
    const m = notes.match(/\b(minimal|bold|cinematic|editorial|luxury|playful|professional|witty|clean|dramatic|natural|high-contrast)\b/gi);
    if (m) kws.push(...m.map(x => x.toLowerCase()));
  }
  return Array.from(new Set(kws.map(k => k.toLowerCase()))).slice(0, 8);
}

const EMPTY_BRAND: BrandMemory = {
  brandName:           null,
  toneKeywords:        [],
  visualStyle:         null,
  tagline:             null,
  preferredHooks:      [],
  negativeTerms:       [],
  performanceSummary:  null,
  klingStyleSuffix:    "",
  fluxStyleSuffix:     "",
  negativeStyleSuffix: "",
  socialPlatforms:     [],
  socialContext:       "",
  characters:          [],
  globalVisualRules:   DEFAULT_GLOBAL_VISUAL_RULES,
  forbiddenChanges:    [
    "no face drift across scenes",
    "no outfit changes unless explicitly defined",
    "no lighting override unless scene specifies",
    "no style deviation from global visual rules",
  ],
};

// Simple in-memory TTL cache for scalability (brand loads are hot path in every generation)
const _brandCache = new Map<string, { value: BrandMemory; expires: number }>();
const BRAND_CACHE_TTL = 1000 * 60 * 2; // 2 minutes

function makeCacheKey(userId: string, brandProfileId?: string | null): string {
  return brandProfileId ? `${userId}:${brandProfileId}` : userId;
}

function getCachedBrand(key: string): BrandMemory | null {
  const hit = _brandCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  if (hit) _brandCache.delete(key);
  return null;
}
function setCachedBrand(key: string, value: BrandMemory) {
  _brandCache.set(key, { value, expires: Date.now() + BRAND_CACHE_TTL });
  if (_brandCache.size > 400) {
    // evict oldest
    const first = _brandCache.keys().next().value;
    if (first) _brandCache.delete(first);
  }
}
export function invalidateBrandMemoryCache(userId?: string, brandProfileId?: string | null) {
  if (userId) {
    const key = makeCacheKey(userId, brandProfileId);
    _brandCache.delete(key);
    // also clear plain user key in case
    _brandCache.delete(userId);
  } else {
    _brandCache.clear();
  }
}

export async function loadBrandMemory(
  userId: string,
  brandProfileId?: string | null
): Promise<BrandMemory & { brandProfileId?: string | null }> {
  if (!userId) return { ...EMPTY_BRAND };

  const cacheKey = makeCacheKey(userId, brandProfileId);

  // Scalability: serve from short TTL cache when possible
  const cached = getCachedBrand(cacheKey);
  if (cached) return { ...cached, brandProfileId: brandProfileId ?? null };

  // Load from brand_brain (AI-curated data) AND brand_profiles (user-entered data) in parallel
  // Support multi-brand: filter by brandProfileId when provided (new requirement)
  const profileFilter = brandProfileId
    ? supabaseAdmin.from("brand_profiles").select("*").eq("id", brandProfileId).eq("user_id", userId).maybeSingle()
    : supabaseAdmin.from("brand_profiles").select("*").eq("user_id", userId).order("is_default", { ascending: false }).limit(1).maybeSingle();

  const [brainResult, profileResult, creatorResult] = await Promise.all([
    supabaseAdmin
      .from("brand_brain")
      .select("brand_name, tone_keywords, visual_style, content_pillars, tagline, preferred_hooks, negative_style_terms, performance_summary")
      .eq("user_id", userId)
      .eq("brand_profile_id", brandProfileId || "") // will be ignored if no column match, but migration adds support path
      .maybeSingle(),
    profileFilter,
    supabaseAdmin
      .from("creator_profiles")
      .select("visual_style, preferred_hooks, content_pillars")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const { data: brain, error: brainErr } = brainResult;
  const profile = profileResult.data as any;
  const creator = creatorResult.data as any;

  // ── FIX: auto-populate brand_brain from brand_profiles/creator if missing (the core memory bug fix)
  if ((!brain || brainErr) && profile && (profile.brand_name || profile.tone_of_voice)) {
    const toneKws = deriveToneKeywords(profile.tone_of_voice, profile.tone_tags, profile.content_style_notes);
    const vs = creator?.visual_style || profile.style_preset || null;
    const hooks = creator?.preferred_hooks || [];
    const pillars = creator?.content_pillars || (profile.content_style_notes ? [profile.content_style_notes] : null);

    try {
      await supabaseAdmin.from("brand_brain").upsert({
        user_id: userId,
        brand_name: profile.brand_name || null,
        tone_keywords: toneKws,
        visual_style: vs,
        content_pillars: pillars,
        tagline: profile.tagline || null,
        preferred_hooks: hooks,
        negative_style_terms: [],
        performance_summary: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      console.info(`[BRAND_MEMORY_FIX] auto-populated brand_brain for ${userId.slice(0, 8)} — memory will now affect generations`);
    } catch (e) {
      console.warn("[brand-memory] auto-populate failed (non-fatal):", (e as any)?.message);
    }
    // Re-fetch once
    const refetch = await supabaseAdmin.from("brand_brain").select("*").eq("user_id", userId).maybeSingle();
    if (refetch.data) {
      const mem = buildFromBrain(refetch.data, profile);
      setCachedBrand(cacheKey, mem);
      return { ...mem, brandProfileId: profile?.id ?? brandProfileId ?? null };
    }
  }

  if (!brain) {
    const socialPlatforms = extractSocialPlatforms(profile?.social_platforms);
    const emptyWithSocial = { ...EMPTY_BRAND, socialPlatforms, socialContext: buildSocialContext(socialPlatforms) };
    setCachedBrand(cacheKey, emptyWithSocial);
    return { ...emptyWithSocial, brandProfileId: profile?.id ?? brandProfileId ?? null };
  }

  const result = buildFromBrain(brain, profile);
  setCachedBrand(cacheKey, result);
  return { ...result, brandProfileId: profile?.id ?? brandProfileId ?? null };
}

function buildFromBrain(brain: any, profile: any): BrandMemory {
  const record = brain as {
    brand_name: string | null;
    tone_keywords: string[] | null;
    visual_style: string | null;
    content_pillars: string[] | null;
    tagline: string | null;
    preferred_hooks: string[] | null;
    negative_style_terms: string[] | null;
    performance_summary: string | null;
  };

  const toneKeywords = record.tone_keywords?.length
    ? record.tone_keywords
    : deriveToneKeywords(profile?.tone_of_voice, profile?.tone_tags, profile?.content_style_notes);

  const visualStyle = record.visual_style || profile?.style_preset || null;

  const klingStyleSuffix = buildKlingStyleSuffix(visualStyle, toneKeywords);
  const fluxStyleSuffix = buildFluxStyleSuffix(visualStyle, toneKeywords);
  const negativeStyleSuffix = buildNegativeStyleSuffix(record.negative_style_terms);

  const socialPlatforms = extractSocialPlatforms(profile?.social_platforms);
  const socialContext = buildSocialContext(socialPlatforms);

  return {
    brandName: record.brand_name,
    toneKeywords,
    visualStyle,
    tagline: record.tagline,
    preferredHooks: record.preferred_hooks ?? [],
    negativeTerms: record.negative_style_terms ?? [],
    performanceSummary: record.performance_summary,
    klingStyleSuffix,
    fluxStyleSuffix,
    negativeStyleSuffix,
    socialPlatforms,
    socialContext,
    characters:       [],  // populated from character_bank when user has saved characters
    globalVisualRules: {
      style:           visualStyle ?? DEFAULT_GLOBAL_VISUAL_RULES.style,
      lighting:        DEFAULT_GLOBAL_VISUAL_RULES.lighting,
      color_grade:     DEFAULT_GLOBAL_VISUAL_RULES.color_grade,
      fps:             DEFAULT_GLOBAL_VISUAL_RULES.fps,
      camera_language: DEFAULT_GLOBAL_VISUAL_RULES.camera_language,
    },
    forbiddenChanges: [
      "no face drift across scenes",
      "no outfit changes unless explicitly defined",
      ...(record.negative_style_terms?.map(t => `no ${t}`) ?? []),
    ],
  };
}

function extractSocialPlatforms(raw: unknown): SocialPlatformEntry[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .filter((e): e is SocialPlatformEntry =>
      typeof e === "object" && e !== null &&
      typeof (e as SocialPlatformEntry).platform === "string" &&
      !!((e as SocialPlatformEntry).handle?.trim() || (e as SocialPlatformEntry).url?.trim())
    );
}

function buildSocialContext(platforms: SocialPlatformEntry[]): string {
  if (!platforms.length) return "";
  const lines = platforms.map(e => {
    const label = e.platform.replace(/_/g, "/").replace(/\b\w/g, c => c.toUpperCase());
    const parts = [label];
    if (e.handle) parts.push(e.handle);
    if (e.url)    parts.push(`(${e.url})`);
    return parts.join(" ");
  });
  return `Connected Social Channels: ${lines.join(" | ")} — tailor hooks, CTAs, and content style for these platforms.`;
}
