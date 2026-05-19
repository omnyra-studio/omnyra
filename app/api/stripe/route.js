import Stripe from 'stripe';

let _stripe = null
function getStripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  return _stripe
}

const PLANS = {
  Creator: { amount: 2900, label: 'Omnyra Creator', description: '200 credits/month · 1 min video · No watermark' },
  Pro:     { amount: 6900, label: 'Omnyra Pro',     description: '500 credits/month · 3 min video · 4K exports' },
  Studio:  { amount: 9900, label: 'Omnyra Studio',  description: '1,500 credits/month · 5 min video · Batch generation' },
};

export async function POST(request) {
  const { plan } = await request.json();

  if (!PLANS[plan]) {
    return Response.json({ error: 'Invalid plan' }, { status: 400 });
  }

  const { amount, label, description } = PLANS[plan];
  const origin = request.headers.get('origin') || 'http://localhost:3000';

  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{
      price_data: {
        currency: 'aud',
        unit_amount: amount,
        recurring: { interval: 'month' },
        product_data: { name: label, description },
      },
      quantity: 1,
    }],
    metadata: { plan },
    subscription_data: { metadata: { plan } },
    success_url: `${origin}/success?plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/`,
    allow_promotion_codes: true,
  });

  return Response.json({ url: session.url });
}
