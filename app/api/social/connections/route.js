import { supabaseAdmin } from '../../../../lib/supabase-admin'

async function getUser(request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  return user ?? null
}

export async function GET(request) {
  const user = await getUser(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabaseAdmin
    .from('social_connections')
    .select('platform, username, avatar_url, token_expires_at, updated_at')
    .eq('user_id', user.id)

  return Response.json(data ?? [])
}

export async function DELETE(request) {
  const user = await getUser(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const platform = searchParams.get('platform')
  if (!platform) return Response.json({ error: 'Missing platform' }, { status: 400 })

  await supabaseAdmin
    .from('social_connections')
    .delete()
    .eq('user_id', user.id)
    .eq('platform', platform)

  return Response.json({ success: true })
}
