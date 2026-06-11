// Required Supabase migrations (run once):
// ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS logo_url text;
// ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS tone_tags text[];
// ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS products jsonb;
// ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS style_preset text;

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { upsertBrandProfile } from "@/lib/brand";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    brand_name, tagline, colors, tone_of_voice, target_audience, niche,
    content_style_notes, logo_url, tone_tags, products, style_preset,
    tiktok_handle, instagram_handle, youtube_handle, facebook_page, target_platforms,
    social_platforms, manual_analytics,
  } = body as {
    brand_name?: string;
    tagline?: string;
    colors?: string[];
    tone_of_voice?: string;
    target_audience?: string;
    niche?: string;
    content_style_notes?: string;
    logo_url?: string;
    tone_tags?: string[];
    products?: Array<{ name: string; description: string }>;
    style_preset?: string;
    tiktok_handle?: string;
    instagram_handle?: string;
    youtube_handle?: string;
    facebook_page?: string;
    target_platforms?: string[];
    social_platforms?: Array<{ platform: string; handle: string; url: string }>;
    manual_analytics?: { avg_views?: string; engagement_rate?: string; best_post_time?: string; top_styles?: string[] };
  };

  try {
    const row = await upsertBrandProfile(user.id, {
      brand_name:          brand_name          ?? null,
      tagline:             tagline             ?? null,
      colors:              colors              ?? [],
      tone_of_voice:       tone_of_voice       ?? null,
      target_audience:     target_audience     ?? null,
      niche:               niche               ?? null,
      content_style_notes: content_style_notes ?? null,
      logo_url:            logo_url            ?? null,
      tone_tags:           tone_tags           ?? [],
      products:            products            ?? [],
      style_preset:        style_preset        ?? null,
      tiktok_handle:       tiktok_handle       ?? null,
      instagram_handle:    instagram_handle    ?? null,
      youtube_handle:      youtube_handle      ?? null,
      facebook_page:       facebook_page       ?? null,
      target_platforms:    target_platforms    ?? [],
      social_platforms:    social_platforms    ?? [],
      manual_analytics:    manual_analytics    ?? null,
    });
    return Response.json(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[brand/save] error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
