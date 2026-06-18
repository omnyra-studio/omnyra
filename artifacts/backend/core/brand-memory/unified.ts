/**
 * artifacts/backend/core/brand-memory/unified.ts
 *
 * UNIFIED BRAND MEMORY — the canonical, fixed implementation.
 *
 * Fixes:
 * - Single load path for all generators.
 * - Auto-sync on save: brand_profiles → creator_profiles + brand_brain (populates the missing table!).
 * - Robust merge: brand_brain (learned) + brand_profiles (user) + creator_profiles.
 * - Centralized prompt suffix builders (no more duplicated logic across 5 files).
 * - Ghost-test safe: no emotion language.
 * - Graceful empty fallbacks.
 * - Optional sync for campaign brand_memories (for backward compat with 20260615 schema).
 *
 * This module is the source of truth for fixes. Live code in lib/memory/brand-memory.ts
 * and callers will be updated to delegate to (or copy) this logic.
 */

import { supabaseAdmin } from "@/lib/supabase/admin"; // live path preserved for now; in pure artifacts would be injected
import type {
  BrandProfileInput,
  CreatorProfileInput,
  BrandBrainRow,
  UnifiedBrandMemory,
  CampaignBrandMemory,
  SocialPlatformEntry,
  Product,
} from "../../types/brand";

// ─────────────────────────────────────────────────────────────────────────────
// Constants & Empty
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_MEMORY: UnifiedBrandMemory = {
  brandName: null,
  tagline: null,
  niche: null,
  targetAudience: null,
  toneOfVoice: null,
  toneKeywords: [],
  visualStyle: null,
  contentPillars: [],
  products: [],
  preferredHooks: [],
  preferredCTAs: [],
  negativeTerms: [],
  performanceSummary: null,
  bestHookType: null,
  bestEnergy: 3,
  bestPacing: "measured",
  topTemplates: [],
  klingStyleSuffix: "",
  fluxStyleSuffix: "",
  negativeStyleSuffix: "",
  socialPlatforms: [],
  socialContext: "",
  hasEnoughHistory: false,
  qualityScore: 0.5,
  totalVideos: 0,
  source: "empty",
};

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Suffix Builders (centralized, fixed, deduped from old logic)
// ─────────────────────────────────────────────────────────────────────────────

function buildKlingStyleSuffix(visualStyle: string | null, toneKeywords: string[] | null): string {
  const parts: string[] = [];
  if (visualStyle) parts.push(visualStyle);
  if (toneKeywords && toneKeywords.length) {
    parts.push(toneKeywords.slice(0, 3).join(", "));
  }
  return parts.filter(Boolean).join(", ");
}

function buildFluxStyleSuffix(visualStyle: string | null, toneKeywords: string[] | null): string {
  const parts: string[] = [];
  if (visualStyle) parts.push(visualStyle);
  if (toneKeywords && toneKeywords.length) {
    // Drop motion terms for static image prompts
    const visualTone = toneKeywords.filter(
      (t) => !/\b(energetic|dynamic|fast|motion|movement|action)\b/i.test(t)
    ).slice(0, 2);
    if (visualTone.length) parts.push(visualTone.join(", "));
  }
  return parts.filter(Boolean).join(", ");
}

function buildNegativeStyleSuffix(negativeTerms: string[] | null): string {
  return (negativeTerms || []).filter(Boolean).join(", ");
}

function buildSocialContext(platforms: SocialPlatformEntry[]): string {
  if (!platforms.length) return "";
  const lines = platforms.map((e) => {
    const label = e.platform.replace(/_/g, "/").replace(/\b\w/g, (c) => c.toUpperCase());
    const parts = [label];
    if (e.handle) parts.push(e.handle);
    if (e.url) parts.push(`(${e.url})`);
    return parts.join(" ");
  });
  return `Connected Social Channels: ${lines.join(" | ")} — tailor hooks, CTAs, and content style for these platforms.`;
}

function deriveToneKeywords(
  toneOfVoice: string | null,
  toneTags: string[] | null,
  contentStyleNotes?: string | null
): string[] {
  const kws: string[] = [];
  if (toneOfVoice) kws.push(...toneOfVoice.split(/[,;]+/).map((s) => s.trim()).filter(Boolean));
  if (toneTags && toneTags.length) kws.push(...toneTags);
  if (contentStyleNotes) {
    // Extract a couple of style adjectives safely (no emotion words)
    const matches = contentStyleNotes.match(/\b(minimal|bold|cinematic|editorial|luxury|playful|professional|witty|clean|dramatic|natural|high-contrast|warm|cool)\b/gi);
    if (matches) kws.push(...matches.map((m) => m.toLowerCase()));
  }
  // Dedup + cap
  return Array.from(new Set(kws.map((k) => k.toLowerCase()))).slice(0, 8);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Load — merges all sources, populates brand_brain if needed
// ─────────────────────────────────────────────────────────────────────────────

export async function loadUnifiedBrandMemory(userId: string): Promise<UnifiedBrandMemory> {
  if (!userId) return { ...EMPTY_MEMORY };

  try {
    const [brainRes, profileRes, creatorRes, weightsRes, historyRes] = await Promise.allSettled([
      supabaseAdmin
        .from("brand_brain")
        .select("brand_name, tone_keywords, visual_style, content_pillars, tagline, preferred_hooks, negative_style_terms, performance_summary, social_platforms")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("brand_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("creator_profiles")
        .select("niche, content_pillars, preferred_hooks, preferred_ctas, visual_style, brand_colors, quality_score, total_videos")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("preference_weights")
        .select("hook_weights, template_weights, top_niches")
        .eq("user_id", userId)
        .maybeSingle(),
      // Light history for best + hasEnough
      supabaseAdmin
        .from("renders")
        .select("id, was_published, template")
        .eq("user_id", userId)
        .order("completed_at", { ascending: false })
        .limit(50),
    ]);

    const brain = (brainRes.status === "fulfilled" && brainRes.value.data) || null;
    const profile = (profileRes.status === "fulfilled" && profileRes.value.data) || null;
    const creator = (creatorRes.status === "fulfilled" && creatorRes.value.data) || null;
    const weights = (weightsRes.status === "fulfilled" && weightsRes.value.data) || null;
    const renders = (historyRes.status === "fulfilled" && historyRes.value.data) || [];

    const hasHistory = renders.length >= 3;
    const publishedCount = renders.filter((r: any) => r.was_published).length;

    // Merge priority: brand_brain (curated) > profile > creator > defaults
    const brandName =
      brain?.brand_name || profile?.brand_name || null;
    const tagline =
      brain?.tagline || profile?.tagline || null;
    const niche =
      (creator?.niche as string | null) || profile?.niche || brain?.content_pillars?.[0] || null;
    const targetAudience = profile?.target_audience || null;
    const toneOfVoice = profile?.tone_of_voice || null;

    const toneKeywords =
      (brain?.tone_keywords as string[] | null) ||
      deriveToneKeywords(toneOfVoice, profile?.tone_tags as string[] | null, profile?.content_style_notes);

    const visualStyle =
      (brain?.visual_style as string | null) ||
      (creator?.visual_style as string | null) ||
      profile?.style_preset ||
      null;

    const contentPillars: string[] =
      (brain?.content_pillars as string[] | null) ||
      (creator?.content_pillars as string[] | null) ||
      (profile?.content_style_notes ? [profile.content_style_notes] : []);

    const products: Product[] = (profile?.products as Product[] | null) || [];

    const preferredHooks: string[] =
      (brain?.preferred_hooks as string[] | null) ||
      (creator?.preferred_hooks as string[] | null) ||
      [];

    const preferredCTAs: string[] = (creator?.preferred_ctas as string[] | null) || [];

    const negativeTerms: string[] =
      (brain?.negative_style_terms as string[] | null) || [];

    const performanceSummary = (brain?.performance_summary as string | null) || null;

    // Best settings from weights or simple derivation
    let bestHookType: string | null = null;
    let bestEnergy = 3;
    let bestPacing: "slow" | "measured" | "fast" = "measured";

    if (weights?.hook_weights) {
      const hw = weights.hook_weights as Record<string, number>;
      const sorted = Object.entries(hw).sort((a, b) => (b[1] as number) - (a[1] as number));
      if (sorted.length) bestHookType = sorted[0][0];
    } else if (preferredHooks.length) {
      bestHookType = preferredHooks[0];
    }

    // Simple energy from published count distribution (stub — real one uses script length in learning)
    if (publishedCount > 10) bestEnergy = 4;
    else if (publishedCount > 3) bestEnergy = 3;

    const topTemplates: Array<{ template: string; publishRate: number }> = [];
    if (renders.length > 0) {
      const byTemplate: Record<string, { total: number; pub: number }> = {};
      for (const r of renders as any[]) {
        const t = (r.template as string) || "unknown";
        byTemplate[t] ??= { total: 0, pub: 0 };
        byTemplate[t].total++;
        if (r.was_published) byTemplate[t].pub++;
      }
      Object.entries(byTemplate)
        .sort((a, b) => (b[1].pub / b[1].total) - (a[1].pub / a[1].total))
        .slice(0, 3)
        .forEach(([template, stats]) => {
          topTemplates.push({
            template,
            publishRate: parseFloat((stats.pub / stats.total).toFixed(3)),
          });
        });
    }

    const socialPlatforms: SocialPlatformEntry[] =
      (profile?.social_platforms as SocialPlatformEntry[] | null) ||
      (brain?.social_platforms as SocialPlatformEntry[] | null) ||
      extractSocialFromHandles(profile);

    const socialContext = buildSocialContext(socialPlatforms);

    // Build suffixes (the critical fix — now always available if profile exists)
    const klingStyleSuffix = buildKlingStyleSuffix(visualStyle, toneKeywords);
    const fluxStyleSuffix = buildFluxStyleSuffix(visualStyle, toneKeywords);
    const negativeStyleSuffix = buildNegativeStyleSuffix(negativeTerms);

    const qualityScore = (creator?.quality_score as number) ?? (hasHistory ? 0.7 : 0.5);
    const totalVideos = (creator?.total_videos as number) ?? renders.length;

    const source: UnifiedBrandMemory["source"] =
      brain ? "brand_brain" : profile ? "brand_profiles" : creator ? "merged" : "empty";

    // Auto-populate brand_brain if we have profile data but brand_brain is empty.
    // This is the key functionality fix.
    if (!brain && profile && (profile.brand_name || profile.tone_of_voice)) {
      void populateBrandBrainFromProfile(userId, profile, creator).catch(() => {}); // void ok here
    }

    return {
      brandName,
      tagline,
      niche,
      targetAudience,
      toneOfVoice,
      toneKeywords,
      visualStyle,
      contentPillars,
      products,
      preferredHooks,
      preferredCTAs,
      negativeTerms,
      performanceSummary,
      bestHookType,
      bestEnergy,
      bestPacing,
      topTemplates,
      klingStyleSuffix,
      fluxStyleSuffix,
      negativeStyleSuffix,
      socialPlatforms,
      socialContext,
      hasEnoughHistory: hasHistory,
      qualityScore,
      totalVideos,
      source,
      lastSyncedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn("[unified-brand-memory] load failed, returning empty:", err);
    return { ...EMPTY_MEMORY, source: "empty" };
  }
}

// Helper to turn legacy handle columns into social_platforms array
function extractSocialFromHandles(profile: any): SocialPlatformEntry[] {
  const out: SocialPlatformEntry[] = [];
  const map: Record<string, string> = {
    tiktok_handle: "tiktok",
    instagram_handle: "instagram_reels",
    youtube_handle: "youtube_shorts",
    facebook_page: "facebook_feed",
  };
  for (const [col, plat] of Object.entries(map)) {
    const val = profile?.[col];
    if (val && typeof val === "string" && val.trim()) {
      out.push({ platform: plat, handle: val.trim(), url: "" });
    }
  }
  return out;
}

async function populateBrandBrainFromProfile(userId: string, profile: any, creator: any) {
  const toneKeywords = deriveToneKeywords(
    profile.tone_of_voice,
    profile.tone_tags,
    profile.content_style_notes
  );

  const row: Partial<BrandBrainRow> & { user_id: string } = {
    user_id: userId,
    brand_name: profile.brand_name || null,
    tone_keywords: toneKeywords,
    visual_style: creator?.visual_style || profile.style_preset || null,
    content_pillars: creator?.content_pillars || (profile.content_style_notes ? [profile.content_style_notes] : []),
    tagline: profile.tagline || null,
    preferred_hooks: creator?.preferred_hooks || [],
    negative_style_terms: [], // populated later via feedback
    performance_summary: null,
    social_platforms: profile.social_platforms || extractSocialFromHandles(profile),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("brand_brain")
    .upsert(row, { onConflict: "user_id" });

  if (error) {
    console.warn("[unified-brand-memory] auto-populate brand_brain failed:", error.message);
  } else {
    console.info(`[BRAND_MEMORY_SYNC] populated brand_brain for user=${userId.slice(0, 8)} from profile`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Save + Sync — the write path that keeps everything consistent
// Call this (or enhance existing upsertBrandProfile to call it) on any brand save.
// ─────────────────────────────────────────────────────────────────────────────

export async function saveBrandProfileAndSync(
  userId: string,
  input: BrandProfileInput & Partial<CreatorProfileInput>
): Promise<{ ok: true; memory: UnifiedBrandMemory } | { ok: false; error: string }> {
  try {
    // 1. Write to primary: brand_profiles (via existing lib or direct)
    const { error: bpErr } = await supabaseAdmin
      .from("brand_profiles")
      .upsert(
        {
          user_id: userId,
          brand_name: input.brand_name ?? null,
          tagline: input.tagline ?? null,
          niche: input.niche ?? null,
          target_audience: input.target_audience ?? null,
          tone_of_voice: input.tone_of_voice ?? null,
          colors: input.colors ?? [],
          content_style_notes: input.content_style_notes ?? null,
          logo_url: input.logo_url ?? null,
          tone_tags: input.tone_tags ?? [],
          products: input.products ?? [],
          style_preset: input.style_preset ?? null,
          tiktok_handle: input.tiktok_handle ?? null,
          instagram_handle: input.instagram_handle ?? null,
          youtube_handle: input.youtube_handle ?? null,
          facebook_page: input.facebook_page ?? null,
          target_platforms: input.target_platforms ?? [],
          social_platforms: input.social_platforms ?? [],
          manual_analytics: input.manual_analytics ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (bpErr) throw new Error(`brand_profiles upsert: ${bpErr.message}`);

    // 2. Also keep creator_profiles in sync for Director Core (best effort)
    if (input.niche || input.preferred_hooks || input.content_pillars || input.visual_style) {
      void Promise.resolve(supabaseAdmin
        .from("creator_profiles")
        .upsert(
          {
            user_id: userId,
            niche: input.niche ?? null,
            content_pillars: input.content_pillars ?? null,
            preferred_hooks: input.preferred_hooks ?? null,
            preferred_ctas: input.preferred_ctas ?? null,
            visual_style: input.visual_style ?? null,
            brand_colors: input.brand_colors ?? input.colors ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        )).catch(() => {}); // non-fatal
    }

    // 3. Force (re)populate brand_brain projection — this fixes the "memory not used in video" bug
    const freshProfile = await supabaseAdmin
      .from("brand_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const freshCreator = await supabaseAdmin
      .from("creator_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    await populateBrandBrainFromProfile(
      userId,
      freshProfile.data || input,
      freshCreator.data || {}
    );

    // 4. Return the now-fresh unified memory (so callers can use immediately)
    const memory = await loadUnifiedBrandMemory(userId);
    return { ok: true, memory };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy Campaign Memory (brand_memories table) — fixed schema alignment
// Note: the 20260615 migration lacks preferred_voice_id / voice_favorites.
// We guard the writes and only use columns that exist.
// For full voice support a follow-up ALTER would be needed (out of scope here).
// ─────────────────────────────────────────────────────────────────────────────

export async function saveCampaignBrandMemory(
  userId: string,
  data: Partial<CampaignBrandMemory>
): Promise<void> {
  // Only columns guaranteed by the migration
  const payload: Record<string, unknown> = {
    user_id: userId,
    campaign_name: data.campaign_name || "default",
    brand_guidelines: data.brand_guidelines || "",
    reference_images: data.reference_images ?? [],
    character_descriptions: data.character_descriptions ?? {},
    tone_and_style: data.tone_and_style || null,
    updated_at: new Date().toISOString(),
  };

  // Optional columns — only include if caller provided and we assume schema extended
  // (In production, check information_schema or catch the error.)
  if (data.preferred_voice_id !== undefined) {
    (payload as any).preferred_voice_id = data.preferred_voice_id;
  }
  if (data.voice_favorites !== undefined) {
    (payload as any).voice_favorites = data.voice_favorites;
  }

  const { error } = await supabaseAdmin
    .from("brand_memories")
    .upsert(payload, { onConflict: "user_id,campaign_name" });

  if (error) {
    // If column error, log clearly (common during transition)
    if (error.message?.includes("column") || error.code === "42703") {
      console.warn("[brand-memory] brand_memories missing columns (preferred_voice_id/voice_favorites). Using base columns only.");
      delete (payload as any).preferred_voice_id;
      delete (payload as any).voice_favorites;
      const retry = await supabaseAdmin.from("brand_memories").upsert(payload, { onConflict: "user_id,campaign_name" });
      if (retry.error) throw retry.error;
    } else {
      throw error;
    }
  }
}

export async function loadCampaignBrandMemory(
  userId: string,
  campaignName = "default"
): Promise<CampaignBrandMemory | null> {
  const { data, error } = await supabaseAdmin
    .from("brand_memories")
    .select("*")
    .eq("user_id", userId)
    .eq("campaign_name", campaignName)
    .maybeSingle();

  if (error && error.code !== "PGRST116") throw error;
  return (data as CampaignBrandMemory) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: get prompt suffixes only (used by many generators)
// ─────────────────────────────────────────────────────────────────────────────

export async function getBrandPromptSuffixes(userId: string): Promise<{
  kling: string;
  flux: string;
  negative: string;
  social: string;
}> {
  const mem = await loadUnifiedBrandMemory(userId);
  return {
    kling: mem.klingStyleSuffix,
    flux: mem.fluxStyleSuffix,
    negative: mem.negativeStyleSuffix,
    social: mem.socialContext,
  };
}

export { EMPTY_MEMORY };
