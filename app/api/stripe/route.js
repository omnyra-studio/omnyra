import Stripe from 'stripe';

const PLANS = {
  Starter: { amount: 1900, label: 'Omnyra Starter', description: 'Unlimited scripts · 30 images · 10 voice clips / month' },
  Creator: { amount: 4900, label: 'Omnyra Creator', description: 'Unlimited scripts · 100 images · 40 voice · 5 videos / month' },
  Studio:  { amount: 9900, label: 'Omnyra Studio',  description: 'Unlimited scripts · 300 images · 120 voice · 20 videos / month' },
};

export async function POST(request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[stripe] STRIPE_SECRET_KEY is not set');
    return Response.json({ error: 'Stripe is not configured' }, { status: 500 });
  }

  let plan;
  try {
    ({ plan } = await request.json());
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!PLANS[plan]) {
    return Response.json({ error: 'Invalid plan' }, { status: 400 });
  }

  const { amount, label, description } = PLANS[plan];
  const origin = request.headers.get('origin') || 'https://omnyra.studio';

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
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
  } catch (err) {
    console.error('[stripe] checkout.sessions.create failed:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
