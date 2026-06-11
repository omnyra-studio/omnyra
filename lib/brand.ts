import { createClient } from "@supabase/supabase-js";
import { cleanEnv } from "@/lib/supabase/admin";

// Columns required beyond base migration:
// ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS logo_url text;
// ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS tone_tags text[];
// ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS products jsonb;
// ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS style_preset text;

export interface BrandProfile {
  id?: string;
  user_id?: string;
  brand_name?: string | null;
  tagline?: string | null;
  colors?: string[] | null;
  tone_of_voice?: string | null;
  target_audience?: string | null;
  niche?: string | null;
  content_style_notes?: string | null;
  logo_url?: string | null;
  tone_tags?: string[] | null;
  products?: Array<{ name: string; description: string }> | null;
  style_preset?: string | null;
  tiktok_handle?: string | null;
  instagram_handle?: string | null;
  youtube_handle?: string | null;
  facebook_page?: string | null;
  target_platforms?: string[] | null;
  social_platforms?: Array<{ platform: string; handle: string; url: string }> | null;
  created_at?: string;
  updated_at?: string;
}

function adminClient() {
  return createClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
}

export async function getBrandProfile(userId: string): Promise<BrandProfile | null> {
  const db = adminClient();
  const { data, error } = await db
    .from("brand_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[brand] getBrandProfile error:", error.message);
    return null;
  }
  return data as BrandProfile | null;
}

export async function upsertBrandProfile(
  userId: string,
  data: Partial<BrandProfile>,
): Promise<BrandProfile> {
  const db = adminClient();
   
  const { id: _id, user_id: _uid, created_at: _ca, ...rest } = data as Record<string, unknown>;
  const { data: row, error } = await db
    .from("brand_profiles")
    .upsert(
      { ...rest, user_id: userId, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    )
    .select()
    .single();
  if (error) throw new Error(`upsertBrandProfile: ${error.message}`);
  return row as BrandProfile;
}

export async function saveBrandProfile(profile: Partial<BrandProfile>): Promise<BrandProfile> {
  const res = await fetch('/api/brand/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error ?? 'Save failed')
  }
  return res.json() as Promise<BrandProfile>
}

export function getBrandSystemPrompt(brand: BrandProfile | null): string {
  if (!brand) return "";
  const parts: string[] = [];
  if (brand.brand_name)    parts.push(`Workspace/Brand: ${brand.brand_name}`);
  if (brand.tone_of_voice) parts.push(`Tone of Voice: ${brand.tone_of_voice}`);
  const colors = Array.isArray(brand.colors) ? brand.colors.filter(Boolean) : [];
  if (colors.length)       parts.push(`Brand Colors: ${colors.join(", ")}`);
  if (Array.isArray(brand.products) && brand.products.length) {
    const list = brand.products.map((p) => `${p.name}: ${p.description}`).join("; ");
    parts.push(`Products/Services: ${list}`);
  }
  if (Array.isArray(brand.tone_tags) && brand.tone_tags.length) {
    parts.push(`Brand Voice Tags: ${brand.tone_tags.join(", ")}`);
  }
  if (brand.style_preset)         parts.push(`Visual Style Preset: ${brand.style_preset}`);
  if (brand.target_audience)      parts.push(`Target Audience: ${brand.target_audience}`);
  if (brand.niche)                parts.push(`Industry/Niche: ${brand.niche}`);
  if (brand.content_style_notes)  parts.push(`Content Style Notes: ${brand.content_style_notes}`);
  if (Array.isArray(brand.target_platforms) && brand.target_platforms.length)
    parts.push(`Target Platforms: ${brand.target_platforms.join(", ")} — optimise hook and CTA for these platforms`);
  if (Array.isArray(brand.social_platforms) && brand.social_platforms.length) {
    const socialLines = brand.social_platforms
      .filter((e) => e.handle || e.url)
      .map((e) => {
        const label = e.platform.replace("_", "/").replace(/\b\w/g, (c) => c.toUpperCase());
        const parts: string[] = [label];
        if (e.handle) parts.push(e.handle);
        if (e.url)    parts.push(`(${e.url})`);
        return parts.join(" ");
      });
    if (socialLines.length)
      parts.push(`Connected Social Accounts: ${socialLines.join(" | ")}`);
  } else {
    const handles: string[] = [];
    if (brand.tiktok_handle)    handles.push(`TikTok: ${brand.tiktok_handle}`);
    if (brand.instagram_handle) handles.push(`Instagram: ${brand.instagram_handle}`);
    if (brand.youtube_handle)   handles.push(`YouTube: ${brand.youtube_handle}`);
    if (brand.facebook_page)    handles.push(`Facebook: ${brand.facebook_page}`);
    if (handles.length) parts.push(`Social Handles: ${handles.join(" | ")}`);
  }
  if (!parts.length) return "";
  return [
    "\n\n— BRAND IDENTITY (align ALL content to this brand) —",
    ...parts,
    "— END BRAND IDENTITY —",
  ].join("\n");
}
