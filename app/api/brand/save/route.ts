// Required Supabase migrations (run once):
// ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS logo_url text;
// ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS tone_tags text[];
// ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS products jsonb;
// ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS style_preset text;

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { upsertBrandProfile } from "@/lib/brand";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { invalidateBrandMemoryCache } from "@/lib/memory/brand-memory";
import { getPostHogClient } from "@/lib/posthog-server";

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
    brand_id, // support for multi-brand (when present we target specific profile instead of user-only upsert)
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
    brand_id?: string;
  };

  try {
    let row: any;

    if (brand_id) {
      // Multi-brand path: update specific brand
      const { data, error } = await supabaseAdmin
        .from("brand_profiles")
        .update({
          brand_name: brand_name ?? undefined,
          tagline: tagline ?? undefined,
          colors: colors ?? undefined,
          tone_of_voice: tone_of_voice ?? undefined,
          target_audience: target_audience ?? undefined,
          niche: niche ?? undefined,
          content_style_notes: content_style_notes ?? undefined,
          logo_url: logo_url ?? undefined,
          tone_tags: tone_tags ?? undefined,
          products: products ?? undefined,
          style_preset: style_preset ?? undefined,
          tiktok_handle: tiktok_handle ?? undefined,
          instagram_handle: instagram_handle ?? undefined,
          youtube_handle: youtube_handle ?? undefined,
          facebook_page: facebook_page ?? undefined,
          target_platforms: target_platforms ?? undefined,
          social_platforms: social_platforms ?? undefined,
          manual_analytics: manual_analytics ?? undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", brand_id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) throw error;
      row = data;

      // Also sync the brain for this specific brand
      try {
        const toneKws = (tone_of_voice ? tone_of_voice.split(/[,;]+/).map((s: string) => s.trim()).filter(Boolean) : [])
          .concat(tone_tags || []);
        await supabaseAdmin.from("brand_brain").upsert({
          user_id: user.id,
          brand_profile_id: brand_id,
          brand_name: brand_name || row.brand_name || null,
          tone_keywords: Array.from(new Set(toneKws.map((k: string) => k.toLowerCase()))).slice(0, 8),
          visual_style: style_preset || null,
          content_pillars: content_style_notes ? [content_style_notes] : [],
          tagline: tagline || null,
          preferred_hooks: [],
          negative_style_terms: [],
          performance_summary: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,brand_profile_id" });
      } catch (syncErr) {
        console.warn("[brand/save] brand_brain (multi) sync non-fatal:", (syncErr as any)?.message);
      }

      invalidateBrandMemoryCache(user.id, brand_id);
    } else {
      // Legacy / default single-brand path (unchanged behavior for existing UI)
      row = await upsertBrandProfile(user.id, {
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

      try {
        const toneKws = (tone_of_voice ? tone_of_voice.split(/[,;]+/).map((s: string) => s.trim()).filter(Boolean) : [])
          .concat(tone_tags || []);
        await supabaseAdmin.from("brand_brain").upsert({
          user_id: user.id,
          brand_name: brand_name || null,
          tone_keywords: Array.from(new Set(toneKws.map((k: string) => k.toLowerCase()))).slice(0, 8),
          visual_style: style_preset || null,
          content_pillars: content_style_notes ? [content_style_notes] : [],
          tagline: tagline || null,
          preferred_hooks: [],
          negative_style_terms: [],
          performance_summary: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      } catch (syncErr) {
        console.warn("[brand/save] brand_brain sync non-fatal:", (syncErr as any)?.message);
      }

      invalidateBrandMemoryCache(user.id);
    }

    // Analytics
    try {
      const ph = getPostHogClient();
      ph.capture({ distinctId: user.id, event: "brand_profile_updated", properties: { has_niche: !!niche, has_social: (social_platforms?.length || 0) > 0, multi: !!brand_id } });
    } catch {}

    return Response.json(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[brand/save] error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
