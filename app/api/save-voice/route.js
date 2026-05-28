import { createClient } from '@supabase/supabase-js'
import { getUserAndPlan } from '../../../lib/auth'

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export async function POST(req) {
  const { user } = await getUserAndPlan(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { voice_id, voice_name } = await req.json()
  const db = getDb()

  const { error } = await db
    .from('profiles')
    .update({ voice_id, voice_name: voice_name || null, voice_type: 'library', has_voice_clone: false })
    .eq('id', user.id)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true })
}
