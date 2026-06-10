// Brand memory loader for orchestration engines.
//
// Pulls brand context from brand_brain. Falls back gracefully if absent.
// Provides two suffix types:
//   klingStyleSuffix — appended to Kling video prompts (motion-aware)
//   fluxStyleSuffix  — appended to Flux image prompts (visual description)
//   negativeStyleSuffix — appended to negative prompts (brand exclusions)

import { supabaseAdmin } from "@/lib/supabase/admin";

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
};

export async function loadBrandMemory(userId: string): Promise<BrandMemory> {
  const { data, error } = await supabaseAdmin
    .from("brand_brain")
    .select("brand_name, tone_keywords, visual_style, content_pillars, tagline, preferred_hooks, negative_style_terms, performance_summary")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return EMPTY_BRAND;

  const record = data as {
    brand_name:           string | null;
    tone_keywords:        string[] | null;
    visual_style:         string | null;
    content_pillars:      string[] | null;
    tagline:              string | null;
    preferred_hooks:      string[] | null;
    negative_style_terms: string[] | null;
    performance_summary:  string | null;
  };

  // Kling suffix: visual_style + tone (motion context for video prompts)
  const klingParts: string[] = [];
  if (record.visual_style) klingParts.push(record.visual_style);
  if (record.tone_keywords?.length) klingParts.push(record.tone_keywords.slice(0, 3).join(", "));

  // Flux suffix: visual_style + 2 tone keywords (static image; drop motion terms)
  const fluxParts: string[] = [];
  if (record.visual_style) fluxParts.push(record.visual_style);
  if (record.tone_keywords?.length) {
    const visualTone = record.tone_keywords
      .filter(t => !/\b(energetic|dynamic|fast|motion|movement)\b/i.test(t))
      .slice(0, 2);
    if (visualTone.length) fluxParts.push(visualTone.join(", "));
  }

  const negativeStyleSuffix = record.negative_style_terms?.filter(Boolean).join(", ") ?? "";

  return {
    brandName:           record.brand_name,
    toneKeywords:        record.tone_keywords ?? [],
    visualStyle:         record.visual_style,
    tagline:             record.tagline,
    preferredHooks:      record.preferred_hooks ?? [],
    negativeTerms:       record.negative_style_terms ?? [],
    performanceSummary:  record.performance_summary,
    klingStyleSuffix:    klingParts.filter(Boolean).join(", "),
    fluxStyleSuffix:     fluxParts.filter(Boolean).join(", "),
    negativeStyleSuffix,
  };
}
