import { supabaseAdmin } from './supabase-admin'

/**
 * Resolves the authenticated user and their current plan from a request.
 * Expects an `Authorization: Bearer <token>` header.
 * Returns { user, plan } — plan defaults to 'free' if unresolvable.
 */
export async function getUserAndPlan(request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return { user: null, plan: 'free' }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return { user: null, plan: 'free' }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .single()

  return { user, plan: profile?.plan ?? 'free' }
}
