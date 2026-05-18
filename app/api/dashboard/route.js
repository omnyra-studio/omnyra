import { supabaseAdmin } from '../../../lib/supabase-admin'
import { PLAN_LIMITS } from '../../../lib/credits'

async function getUserFromRequest(request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  return user ?? null
}

export async function GET(request) {
  const user = await getUserFromRequest(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const [creditRes, profileRes, txRes] = await Promise.all([
    supabaseAdmin.from('credits').select('balance').eq('user_id', user.id).single(),
    supabaseAdmin.from('profiles').select('plan').eq('id', user.id).single(),
    supabaseAdmin
      .from('credit_transactions')
      .select('amount, type, description, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  const balance      = creditRes.data?.balance ?? 0
  const plan         = profileRes.data?.plan ?? 'free'
  const transactions = txRes.data ?? []
  const planCredits  = PLAN_LIMITS[plan]?.credits ?? 50

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const usageTx = transactions.filter(
    t => t.type === 'usage' && new Date(t.created_at) >= startOfMonth
  )

  // Group usage by category
  const CATEGORIES = {
    image:  ['image_standard', 'image_hd', 'image_variations'],
    voice:  ['voice_30s', 'voice_1min', 'voice_clone'],
    video:  ['video_30s', 'video_1min', 'video_2min', 'video_3min', 'video_5min', 'video_regen'],
    other:  ['avatar_30s', 'avatar_60s', 'sync_regen', 'rewrite'],
  }

  const usage = {}
  for (const [cat, keys] of Object.entries(CATEGORIES)) {
    const catTx = usageTx.filter(t => keys.includes(t.description))
    usage[cat] = {
      count:   catTx.length,
      credits: catTx.reduce((sum, t) => sum + Math.abs(t.amount), 0),
    }
  }

  return Response.json({
    email:         user.email,
    plan,
    balance,
    planCredits,
    usedThisMonth: usageTx.reduce((sum, t) => sum + Math.abs(t.amount), 0),
    usage,
    transactions:  transactions.slice(0, 15),
  })
}
