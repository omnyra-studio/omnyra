/* POST /api/checkout
 *
 * Auth-gated Stripe checkout session creator.
 * - Authenticated user is bound to the session via client_reference_id
 *   so the webhook can resolve the buyer reliably.
 * - price_id is whitelisted against env-configured plan IDs to prevent
 *   metadata tampering / arbitrary-plan abuse.
 */

import Stripe from 'stripe'
import { getUserAndPlan } from '../../../lib/auth'

const PLAN_PRICE_ALLOWLIST = {
  creator: process.env.STRIPE_PRICE_CREATOR,
  pro:     process.env.STRIPE_PRICE_PRO,
  studio:  process.env.STRIPE_PRICE_STUDIO,
}

function resolvePlanForPrice(priceId) {
  for (const [plan, allowed] of Object.entries(PLAN_PRICE_ALLOWLIST)) {
    if (allowed && allowed === priceId) return plan
  }
  return null
}

export async function POST(request) {
  const { user } = await getUserAndPlan(request)
  if (!user) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  const priceId = typeof body?.price_id === 'string' ? body.price_id : ''
  if (!priceId) {
    return Response.json({ error: 'price_id_required' }, { status: 400 })
  }

  // Server-authoritative plan resolution — ignore any plan the client sent.
  const plan = resolvePlanForPrice(priceId)
  if (!plan) {
    return Response.json({ error: 'unknown_price_id' }, { status: 400 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const origin = request.headers.get('origin') || 'https://omnyra.studio'

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: user.id,
    customer_email: user.email,
    metadata: { plan, user_id: user.id },
    subscription_data: { metadata: { plan, user_id: user.id } },
    success_url: `${origin}/dashboard`,
    cancel_url: `${origin}/#pricing`,
    allow_promotion_codes: true,
  })

  return Response.json({ url: session.url })
}
