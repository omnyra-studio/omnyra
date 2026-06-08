// Brand memory loader for the parallel orchestration engine.
//
// Pulls brand context from the brand_brain tables (already exist in the codebase).
// Falls back gracefully if brand data is absent.

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface BrandMemory {
  brandName:      string | null;
  toneKeywords:   string[];
  visualStyle:    string | null;
  klingStyleSuffix: string;   // ready-to-append Kling prompt fragment
}

const EMPTY_BRAND: BrandMemory = {
  brandName:       null,
  toneKeywords:    [],
  visualStyle:     null,
  klingStyleSuffix: "",
};

export async function loadBrandMemory(userId: string): Promise<BrandMemory> {
  // brand_brain stores brand context; fall back gracefully if table absent/empty
  const { data, error } = await supabaseAdmin
    .from("brand_brain")
    .select("brand_name, tone_keywords, visual_style, content_pillars")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return EMPTY_BRAND;

  const record = data as {
    brand_name:     string | null;
    tone_keywords:  string[] | null;
    visual_style:   string | null;
    content_pillars: string[] | null;
  };

  // Build a Kling-ready style suffix from brand visual identity
  const styleParts: string[] = [];
  if (record.visual_style) styleParts.push(record.visual_style);
  if (record.tone_keywords?.length) styleParts.push(record.tone_keywords.slice(0, 3).join(", "));

  return {
    brandName:       record.brand_name,
    toneKeywords:    record.tone_keywords ?? [],
    visualStyle:     record.visual_style,
    klingStyleSuffix: styleParts.filter(Boolean).join(", "),
  };
}
