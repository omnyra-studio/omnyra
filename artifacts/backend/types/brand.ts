/**
 * artifacts/backend/types/brand.ts
 * Canonical Brand Memory contracts — single source of truth.
 * These types are the target for the fixed implementation.
 * Used by unified brand-memory core.
 * Mirrors/extends the fields from brand_profiles, creator_profiles, brand_brain, brand_memories
 * for full compatibility during transition.
 */

export interface SocialPlatformEntry {
  platform: string;
  handle: string;
  url: string;
}

export interface Product {
  name: string;
  description: string;
}

export interface ManualAnalytics {
  avg_views?: string;
  engagement_rate?: string;
  best_post_time?: string;
  top_styles?: string[];
}

// Primary user-editable brand profile (source of truth for input)
export interface BrandProfileInput {
  brand_name?: string | null;
  tagline?: string | null;
  niche?: string | null;
  target_audience?: string | null;
  tone_of_voice?: string | null;
  colors?: string[] | null;
  content_style_notes?: string | null;
  logo_url?: string | null;
  tone_tags?: string[] | null;
  products?: Product[] | null;
  style_preset?: string | null;
  tiktok_handle?: string | null;
  instagram_handle?: string | null;
  youtube_handle?: string | null;
  facebook_page?: string | null;
  target_platforms?: string[] | null;
  social_platforms?: SocialPlatformEntry[] | null;
  manual_analytics?: ManualAnalytics | null;
}

// Learned / derived creator profile (used by Director + best settings)
export interface CreatorProfileInput {
  niche?: string | null;
  audience_type?: string | null;
  communication_style?: string | null;
  pacing?: string | null;
  preferred_hooks?: string[] | null;
  preferred_ctas?: string[] | null;
  content_pillars?: string[] | null;
  visual_style?: string | null;
  brand_colors?: string[] | null;
  quality_score?: number;
  total_videos?: number;
}

// The "brand_brain" row shape used for prompt injection (kling/flux suffixes etc.)
// This was missing writes — now the sync target.
export interface BrandBrainRow {
  user_id: string;
  brand_name: string | null;
  tone_keywords: string[] | null;      // derived from tone_of_voice + tone_tags
  visual_style: string | null;
  content_pillars: string[] | null;
  tagline: string | null;
  preferred_hooks: string[] | null;
  negative_style_terms: string[] | null;
  performance_summary: string | null;
  // extended
  social_platforms?: SocialPlatformEntry[] | null;
  updated_at?: string;
}

// The unified view returned to all generators (prompt enhancers, orchestrators)
export interface UnifiedBrandMemory {
  // Identity
  brandName: string | null;
  tagline: string | null;
  niche: string | null;
  targetAudience: string | null;
  toneOfVoice: string | null;
  toneKeywords: string[];           // ready list for prompts
  visualStyle: string | null;
  contentPillars: string[];
  products: Product[];

  // Hooks / style / negative
  preferredHooks: string[];
  preferredCTAs: string[];
  negativeTerms: string[];

  // Performance-derived
  performanceSummary: string | null;
  bestHookType: string | null;
  bestEnergy: number;               // 1-5
  bestPacing: "slow" | "measured" | "fast";
  topTemplates: Array<{ template: string; publishRate: number }>;

  // Prompt-ready suffixes (centralized, no duplication)
  klingStyleSuffix: string;         // for video/motion prompts
  fluxStyleSuffix: string;          // for image prompts
  negativeStyleSuffix: string;      // for negative prompts

  // Social / distribution
  socialPlatforms: SocialPlatformEntry[];
  socialContext: string;            // injectable sentence

  // Meta
  hasEnoughHistory: boolean;
  qualityScore: number;
  totalVideos: number;
  source: "brand_brain" | "brand_profiles" | "merged" | "empty";
  lastSyncedAt?: string;
}

// For the campaign-oriented brand_memories (20260615) — legacy support path
export interface CampaignBrandMemory {
  id?: string;
  user_id?: string;
  campaign_name: string;
  brand_guidelines: string;
  reference_images?: string[];
  character_descriptions?: Record<string, unknown>;
  tone_and_style?: string;
  preferred_voice_id?: string | null;   // note: may require ALTER if not present
  voice_favorites?: string[];
  updated_at?: string;
}

// Outcome signals for feedback
export interface BrandOutcomeSignal {
  generationId: string;
  was_published: boolean;
  was_edited: boolean;
  user_rating?: number;
  template?: string;
  hook_type?: string;
  energy_level?: number;
  pacing?: string;
}
