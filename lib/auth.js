import { supabaseAdmin } from './supabase-admin'

/**
 * Resolves the authenticated user and their current plan from a request.
 * Expects an `Authorization: Bearer <supabase-access-token>` header.
 * Returns { user, plan } — plan defaults to 'free' if unresolvable.
 */
export async function getUserAndPlan(request) {
  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null

  if (!token) {
    console.log('[auth] getUserAndPlan: no Bearer token in Authorization header')
    return { user: null, plan: 'free' }
  }

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !user) {
    console.log('[auth] getUserAndPlan: token validation failed', { code: userError?.code })
    return { user: null, plan: 'free' }
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .single()

  if (profileError) {
    // PGRST116 = no rows found (user exists in auth but not yet in profiles)
    if (profileError.code !== 'PGRST116') {
      console.log('[auth] getUserAndPlan: profiles lookup error', { code: profileError.code, message: profileError.message })
    }
  }

  return { user, plan: profile?.plan ?? 'free' }
}
