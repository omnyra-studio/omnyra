import { createClient } from '@supabase/supabase-js'
import { sendCreditLowWarning } from './email.js'

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export const PLAN_LIMITS = {
  free: {
    scripts_per_day: 5,
    voice_previews_per_week: 3,
    videos_per_month: 1,
    syncs_per_month: 0,
    credits: 50,
  },
  creator: {
    scripts_per_month: 25,
    voice_per_month: 15,
    videos_per_month: 6,
    syncs_per_month: 6,
    credits: 200,
  },
  pro: {
    scripts_per_month: 80,
    voice_per_month: 50,
    videos_per_month: 20,
    syncs_per_month: 20,
    credits: 500,
  },
  studio: {
    scripts_per_month: 200,
    voice_per_month: 120,
    videos_per_month: 60,
    syncs_per_month: 60,
    credits: 1500,
  },
}

export const CREDIT_COSTS = {
  image_standard: 2,
  image_hd: 4,
  image_variations: 5,
  voice_30s: 2,
  voice_1min: 4,
  voice_clone: 8,
  video_30s: 20,
  video_1min: 40,
  video_2min: 80,
  video_3min: 120,
  video_5min: 200,
  video_regen: 8,
  avatar_30s: 25,
  avatar_60s: 45,
  sync_regen: 6,
  rewrite: 1,
}

export async function deductCredits(userId, action) {
  const cost = CREDIT_COSTS[action]
  if (!cost) return { success: true, cost: 0 }

  const db = getDb()

  const { data: credit } = await db
    .from('credits')
    .select('balance, plan')
    .eq('user_id', userId)
    .single()

  if (!credit || credit.balance < cost) {
    return { success: false, error: 'Insufficient credits', balance: credit?.balance ?? 0 }
  }

  const newBalance = credit.balance - cost

  const { error } = await db
    .from('credits')
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq('user_id', userId)

  if (error) return { success: false, error: 'Failed to deduct credits' }

  await db.from('credit_transactions').insert({
    user_id: userId,
    amount: -cost,
    type: 'usage',
    description: action,
  })

  const plan = credit.plan ?? 'free'
  const planCredits = PLAN_LIMITS[plan]?.credits ?? 50
  const threshold = Math.floor(planCredits * 0.2)
  if (credit.balance > threshold && newBalance <= threshold) {
    db.auth.admin.getUserById(userId)
      .then(({ data }) => {
        if (data?.user?.email) {
          sendCreditLowWarning(data.user.email, { balance: newBalance, planCredits, plan })
            .catch(err => console.error('[email] Credit warning failed:', err.message))
        }
      })
      .catch(() => {})
  }

  return { success: true, cost, remaining: newBalance }
}

export async function getUserProfile(userId) {
  const { data } = await getDb()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return data
}

export async function getBalance(userId) {
  const { data } = await getDb()
    .from('credits')
    .select('balance')
    .eq('user_id', userId)
    .single()
  return data?.balance ?? 0
}
