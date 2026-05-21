import { NextResponse } from 'next/server';
import Stripe from 'stripe';

// Pack identifier → price env var, checkout mode, credits awarded (null = subscription)
const PACK_CONFIG = {
  creator:   { priceEnv: 'STRIPE_PRICE_CREATOR',  mode: 'subscription', credits: null },
  pro:       { priceEnv: 'STRIPE_PRICE_PRO',       mode: 'subscription', credits: null },
  studio:    { priceEnv: 'STRIPE_PRICE_STUDIO',    mode: 'subscription', credits: null },
  pack_100:  { priceEnv: 'STRIPE_PRICE_PACK_100',  mode: 'payment',      credits: 100  },
  pack_300:  { priceEnv: 'STRIPE_PRICE_PACK_300',  mode: 'payment',      credits: 300  },
  pack_800:  { priceEnv: 'STRIPE_PRICE_PACK_800',  mode: 'payment',      credits: 800  },
  pack_2000: { priceEnv: 'STRIPE_PRICE_PACK_2000', mode: 'payment',      credits: 2000 },
};

export async function POST(request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { pack, userId, email } = body;

  if (!pack || !userId) {
    return NextResponse.json({ error: 'Missing required fields: pack, userId' }, { status: 400 });
  }

  const config = PACK_CONFIG[pack];
  if (!config) {
    return NextResponse.json({ error: `Unknown pack: ${pack}` }, { status: 400 });
  }

  const priceId = process.env[config.priceEnv];
  if (!priceId || priceId.startsWith('price_xxxxx')) {
    return NextResponse.json(
      { error: `Price not configured for ${pack}. Add ${config.priceEnv} to environment variables.` },
      { status: 500 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://omnyra.studio';

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const sessionParams = {
      mode: config.mode,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard?upgrade=success&pack=${pack}`,
      cancel_url: `${appUrl}/dashboard/credits?upgrade=cancelled`,
      metadata: { userId, pack },
      allow_promotion_codes: true,
    };

    if (email) sessionParams.customer_email = email;

    // For subscriptions, mirror metadata into subscription_data so webhook
    // can read it on invoice.payment_succeeded and subscription updates
    if (config.mode === 'subscription') {
      sessionParams.subscription_data = { metadata: { userId, pack } };
    }

    // For credit packs, embed credit count so webhook knows what to award
    if (config.credits) {
      sessionParams.metadata.credits = String(config.credits);
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[stripe/create-checkout]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
