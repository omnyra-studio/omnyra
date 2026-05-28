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

// Credits granted per plan per month. Free is a one-time onboarding grant.
export const PLAN_LIMITS = {
  free:    { credits: 30 },
  starter: { credits: 100 },
  creator: { credits: 350 },
  studio:  { credits: 900 },
  // legacy alias
  pro:     { credits: 350 },
}

// Scripts / captions / research are free — 0 cost enforced in creditGate FREE_ACTIONS.
// Everything else consumes from the single credit pool.
export const CREDIT_COSTS = {
  // Images
  image_standard: 3,
  image_hd:       6,
  // Voice
  voice_30s: 3,
  voice_60s: 6,
  // Video
  video_30s: 20,
  video_60s: 40,
  // Avatar / lipsync
  avatar_30s: 40,
  avatar_60s: 80,
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
