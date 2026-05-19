import { supabaseAdmin } from '../../../../lib/supabase-admin'

async function getUser(request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  return user ?? null
}

// List scheduled + published posts
export async function GET(request) {
  const user = await getUser(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('scheduled_posts')
    .select('*')
    .eq('user_id', user.id)
    .neq('status', 'draft')
    .order('scheduled_for', { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data ?? [])
}

// Create a scheduled post
export async function POST(request) {
  const user = await getUser(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { generation_id, title, caption, media_url, media_type, thumbnail_url, platforms, scheduled_for } = body

  if (!platforms?.length) return Response.json({ error: 'Select at least one platform' }, { status: 400 })

  const status = scheduled_for ? 'scheduled' : 'publishing'

  const { data, error } = await supabaseAdmin
    .from('scheduled_posts')
    .insert({
      user_id: user.id,
      generation_id: generation_id ?? null,
      title,
      caption,
      media_url,
      media_type,
      thumbnail_url,
      platforms,
      scheduled_for: scheduled_for ?? null,
      status,
    })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // If "post now", trigger immediate publish via cron handler
  if (!scheduled_for) {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/social/cron`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET || '' },
        body: JSON.stringify({ post_id: data.id }),
      })
    } catch {}
  }

  return Response.json(data)
}

// Update a post (e.g. reschedule or cancel)
export async function PATCH(request) {
  const user = await getUser(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, ...updates } = await request.json()
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

  const allowed = ['caption', 'platforms', 'scheduled_for', 'status']
  const safe = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)))
  safe.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('scheduled_posts')
    .update(safe)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(request) {
  const user = await getUser(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

  await supabaseAdmin
    .from('scheduled_posts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  return Response.json({ success: true })
}
