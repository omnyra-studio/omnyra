import { createClient } from '@supabase/supabase-js';
import { getUserAndPlan } from '../../../lib/auth';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET(request) {
  const { user } = await getUserAndPlan(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  const [brandRes, profileRes] = await Promise.all([
    db.from('brand_profiles').select('*').eq('user_id', user.id).single(),
    db.from('profiles').select('tiktok_handle,instagram_handle,youtube_url,facebook_url,linkedin_url,twitter_handle,website_url,brand_voice,primary_niche,competitors').eq('id', user.id).single(),
  ]);

  if (brandRes.error && brandRes.error.code !== 'PGRST116') {
    return Response.json({ error: brandRes.error.message }, { status: 500 });
  }

  return Response.json({ ...(brandRes.data || {}), ...(profileRes.data || {}) });
}

export async function POST(request) {
  const { user } = await getUserAndPlan(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const {
    brand_name, tagline, colors, tone_of_voice, target_audience, niche, content_style_notes,
    tiktok_handle, instagram_handle, youtube_url, facebook_url, linkedin_url, twitter_handle,
    website_url, brand_voice, primary_niche, competitors,
  } = body;

  const db = getDb();

  const [brandResult] = await Promise.all([
    db.from('brand_profiles').upsert({
      user_id: user.id,
      brand_name: brand_name || null,
      tagline: tagline || null,
      colors: colors || [],
      tone_of_voice: tone_of_voice || null,
      target_audience: target_audience || null,
      niche: niche || null,
      content_style_notes: content_style_notes || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' }).select().single(),
    db.from('profiles').update({
      ...(tiktok_handle !== undefined && { tiktok_handle: tiktok_handle || null }),
      ...(instagram_handle !== undefined && { instagram_handle: instagram_handle || null }),
      ...(youtube_url !== undefined && { youtube_url: youtube_url || null }),
      ...(facebook_url !== undefined && { facebook_url: facebook_url || null }),
      ...(linkedin_url !== undefined && { linkedin_url: linkedin_url || null }),
      ...(twitter_handle !== undefined && { twitter_handle: twitter_handle || null }),
      ...(website_url !== undefined && { website_url: website_url || null }),
      ...(brand_voice !== undefined && { brand_voice: brand_voice || null }),
      ...(primary_niche !== undefined && { primary_niche: primary_niche || null }),
      ...(competitors !== undefined && { competitors: competitors || null }),
    }).eq('id', user.id),
  ]);

  if (brandResult.error) return Response.json({ error: brandResult.error.message }, { status: 500 });
  return Response.json(brandResult.data);
}
