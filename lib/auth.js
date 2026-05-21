import { createClient } from '@supabase/supabase-js'

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export async function getUserAndPlan(request) {
  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null

  if (!token) {
    console.log('[auth] getUserAndPlan: no Bearer token in Authorization header')
    return { user: null, plan: 'free' }
  }

  const db = getDb()

  const { data: { user }, error: userError } = await db.auth.getUser(token)
  if (userError || !user) {
    console.log('[auth] getUserAndPlan: token validation failed', { code: userError?.code })
    return { user: null, plan: 'free' }
  }

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .single()

  if (profileError && profileError.code !== 'PGRST116') {
    console.log('[auth] getUserAndPlan: profiles lookup error', { code: profileError.code, message: profileError.message })
  }

  return { user, plan: profile?.plan ?? 'free' }
}
