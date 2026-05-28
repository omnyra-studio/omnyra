import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const PACK_MAP: Record<string, { priceEnv: string; credits: number; name: string }> = {
  small:  { priceEnv: 'STRIPE_SMALL_PACK_PRICE_ID',  credits: 100, name: 'Small Pack'  },
  medium: { priceEnv: 'STRIPE_MEDIUM_PACK_PRICE_ID', credits: 300, name: 'Medium Pack' },
  large:  { priceEnv: 'STRIPE_LARGE_PACK_PRICE_ID',  credits: 700, name: 'Large Pack'  },
};

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  const { data: { user }, error: authErr } = await db.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { packId } = body as { packId?: string };

  const pack = packId ? PACK_MAP[packId] : undefined;
  if (!pack) {
    return NextResponse.json({ error: `Unknown packId: ${packId}. Valid: small, medium, large` }, { status: 400 });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  const priceId = process.env[pack.priceEnv];
  if (!priceId) {
    return NextResponse.json(
      { error: `Price not configured. Add ${pack.priceEnv} to environment variables.` },
      { status: 500 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://omnyra.studio';

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/account/billing?purchase=success`,
      cancel_url:  `${appUrl}/account/billing`,
      customer_email: user.email,
      metadata: {
        userId: user.id,
        pack: packId!,
        credits: String(pack.credits),
      },
      allow_promotion_codes: true,
    });

    console.log(`[billing/purchase-pack] Created checkout session for user ${user.id} pack=${packId} credits=${pack.credits}`);
    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Stripe error';
    console.error('[billing/purchase-pack]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
