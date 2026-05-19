import { getUserAndPlan } from '../../../lib/auth'
import { supabaseAdmin } from '../../../lib/supabase-admin'

export async function GET(request) {
  const { user } = await getUserAndPlan(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('brand_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error && error.code !== 'PGRST116') {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data || {})
}

export async function POST(request) {
  const { user } = await getUserAndPlan(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { brand_name, tagline, colors, tone_of_voice, target_audience, niche, content_style_notes } = body

  const { data, error } = await supabaseAdmin
    .from('brand_profiles')
    .upsert({
      user_id: user.id,
      brand_name: brand_name || null,
      tagline: tagline || null,
      colors: colors || [],
      tone_of_voice: tone_of_voice || null,
      target_audience: target_audience || null,
      niche: niche || null,
      content_style_notes: content_style_notes || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json(data)
}
