/* Ledger-driven credit utilities.
 *
 * Authority model (post credit_ledger.sql migration):
 *   - `credit_transactions` is the source of truth.
 *   - `credits.balance` is a DB-trigger-maintained cache. Never write
 *     to it directly from application code — only insert into
 *     credit_transactions, the trigger updates the cache.
 *
 * Convention:
 *   amount > 0  →  credit  (subscription grant, refund, promo, bonus)
 *   amount < 0  →  debit   (usage)
 *
 * Reads go through `credits.balance` (cheap, no aggregate). For audit
 * or drift detection, use the `credit_balances` view (= SUM of ledger).
 */

import { supabaseAdmin } from './supabase/admin'
import { sendCreditLowWarning } from './email.js'

function getDb() {
  return supabaseAdmin
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

/**
 * Atomic credit deduction.
 *
 * Calls the `try_deduct_credits` PL/pgSQL function which:
 *   - Locks the credits row (SELECT FOR UPDATE)
 *   - Verifies sufficient balance
 *   - Inserts a negative credit_transactions row (trigger updates cache)
 *
 * The whole thing runs in ONE database transaction. Concurrent calls
 * for the same user are serialized by the row lock — no race condition
 * where two requests both see "enough credits" and both deduct.
 *
 * Spec rule 5: "ALL multi-step updates must be atomic." Enforced here.
 */
export async function deductCredits(userId, action, extra = {}) {
  const cost = CREDIT_COSTS[action]
  if (!cost) return { success: true, cost: 0 }

  const db = getDb()

  const { data: plan } = await db
    .from('credits')
    .select('plan')
    .eq('user_id', userId)
    .single()
  const userPlan = plan?.plan ?? 'free'

  const { data: rpc, error: rpcErr } = await db.rpc('try_deduct_credits', {
    p_user_id: userId,
    p_amount: cost,
    p_type: 'usage',
    p_description: extra.description ?? action,
  })

  if (rpcErr) {
    console.error('[credits] try_deduct_credits failed:', rpcErr.message)
    return { success: false, error: 'Failed to deduct credits' }
  }

  const row = Array.isArray(rpc) ? rpc[0] : rpc
  if (!row?.ok) {
    return {
      success: false,
      error: row?.reason === 'insufficient_credits' ? 'Insufficient credits' : (row?.reason ?? 'unknown'),
      balance: row?.new_balance ?? 0,
    }
  }

  const newBalance = Number(row.new_balance)
  const planCredits = PLAN_LIMITS[userPlan]?.credits ?? 50
  const threshold = Math.floor(planCredits * 0.2)

  // Low-credit warning (fire-and-forget). Threshold-crossing check
  // uses the new balance + delta.
  if (newBalance <= threshold && newBalance + cost > threshold) {
    db.auth.admin.getUserById(userId)
      .then(({ data }) => {
        if (data?.user?.email) {
          sendCreditLowWarning(data.user.email, { balance: newBalance, planCredits, plan: userPlan })
            .catch(err => console.error('[email] Credit warning failed:', err.message))
        }
      })
      .catch(() => {})
  }

  return { success: true, cost, remaining: newBalance }
}

export async function checkBalance(userId, action) {
  const cost = CREDIT_COSTS[action] ?? 0
  if (!cost) return { ok: true, cost: 0, balance: 0 }
  const balance = await getBalance(userId)
  return { ok: balance >= cost, cost, balance }
}

/**
 * Refund credits. Inserts a positive ledger row; the trigger updates
 * the cache. `reason` is stored in `description` for the audit trail.
 */
export async function refundCredits(userId, action, reason) {
  const cost = CREDIT_COSTS[action]
  if (!cost) return

  await getDb().from('credit_transactions').insert({
    user_id: userId,
    amount: cost,
    type: 'refund',
    description: `Refund: ${reason ?? action}`,
  })
}

/**
 * Grant credits (subscription renewal, promo, onboarding bonus, churn
 * intervention, viral reward). Single ledger path for any positive change.
 */
export async function grantCredits(userId, amount, type, description) {
  if (!Number.isFinite(amount) || amount <= 0) return { success: false, error: 'invalid_amount' }

  const { error } = await getDb().from('credit_transactions').insert({
    user_id: userId,
    amount,
    type: type ?? 'topup',
    description: description ?? null,
  })

  if (error) {
    console.error('[credits] grant failed:', error.message)
    return { success: false, error: error.message }
  }
  return { success: true, amount }
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
