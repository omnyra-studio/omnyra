import Stripe from 'stripe'

let _stripe = null
function getStripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  return _stripe
}

export async function POST(request) {
  const { price_id, plan } = await request.json()

  if (!price_id) {
    return Response.json({ error: 'price_id is required' }, { status: 400 })
  }

  const origin = request.headers.get('origin') || 'https://omnyra.studio'

  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: price_id, quantity: 1 }],
    metadata: { plan: plan ?? '' },
    subscription_data: { metadata: { plan: plan ?? '' } },
    success_url: `${origin}/dashboard`,
    cancel_url: `${origin}/#pricing`,
    allow_promotion_codes: true,
  })

  return Response.json({ url: session.url })
}
