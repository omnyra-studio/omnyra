import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Action costs (credits). Scripts/captions/research are free.
const ACTION_COSTS: Record<string, number> = {
  image_standard: 3,
  image_hd:       6,
  voice_30s:      3,
  voice_60s:      6,
  video_30s:      20,
  video_60s:      40,
  avatar_30s:     40,
  avatar_60s:     80,
};

// Monthly credit grants per plan
const TIER_CREDITS: Record<string, number> = {
  free: 30, starter: 100, creator: 350, studio: 900, pro: 350,
};

const TIER_LIMITS: Record<string, Record<string, number | 'unlimited'>> = {
  free:    { scripts: 'unlimited', images: 10,  voice: 10,  video: 1,  avatar: 0 },
  starter: { scripts: 'unlimited', images: 33,  voice: 33,  video: 5,  avatar: 0 },
  creator: { scripts: 'unlimited', images: 116, voice: 116, video: 17, avatar: 8 },
  studio:  { scripts: 'unlimited', images: 300, voice: 300, video: 45, avatar: 22 },
  pro:     { scripts: 'unlimited', images: 116, voice: 116, video: 17, avatar: 8 },
};

const TIER_PRICES: Record<string, string> = {
  free: '$0', starter: '$19 AUD/mo', creator: '$49 AUD/mo',
  studio: '$99 AUD/mo', pro: '$49 AUD/mo',
};

const AVAILABLE_PACKS = [
  { id: 'small',  name: 'Small Pack',  credits: 100, price_aud: 19 },
  { id: 'medium', name: 'Medium Pack', credits: 300, price_aud: 49 },
  { id: 'large',  name: 'Large Pack',  credits: 700, price_aud: 99 },
];

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function monthStart() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1).toISOString();
}

function nextMonthFirst() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth() + 1, 1).toISOString().split('T')[0];
}

function categorise(actionType: string): string {
  const t = (actionType ?? '').toLowerCase();
  if (/^(script|caption|brief|hook|rewrite)/.test(t)) return 'scripts';
  if (/^(image|img)/.test(t))                         return 'images';
  if (/^(voice|audio|clone)/.test(t))                 return 'voice';
  if (/^(video|render|cinematic)/.test(t))            return 'video';
  if (/^(avatar|heygen|lipsync|photo.anim)/.test(t))  return 'avatar';
  return 'other';
}

export async function GET(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  const { data: { user }, error: authErr } = await db.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [profileRes, creditsRes, usageRes, txRes] = await Promise.all([
    db.from('profiles')
      .select('plan, stripe_customer_id, stripe_subscription_id')
      .eq('id', user.id)
      .single(),
    db.from('credits')
      .select('balance')
      .eq('user_id', user.id)
      .single(),
    db.from('usage_logs')
      .select('action_type')
      .eq('user_id', user.id)
      .gte('created_at', monthStart()),
    db.from('credit_transactions')
      .select('amount, type, description, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const tier = (profileRes.data?.plan ?? 'free') as string;
  const limits = TIER_LIMITS[tier] ?? TIER_LIMITS.free;
  const balance = creditsRes.data?.balance ?? 0;

  const counts: Record<string, number> = { scripts: 0, images: 0, voice: 0, video: 0, avatar: 0 };
  for (const row of usageRes.data ?? []) {
    const cat = categorise(row.action_type ?? '');
    if (cat in counts) counts[cat]++;
  }

  const monthly_usage = Object.fromEntries(
    ['scripts', 'images', 'voice', 'video', 'avatar'].map(k => [
      k,
      { used: counts[k], limit: limits[k] },
    ])
  );

  return NextResponse.json({
    tier,
    tier_price: TIER_PRICES[tier] ?? '$0',
    credits_balance: balance,
    credits_reset_date: nextMonthFirst(),
    has_stripe_customer: !!profileRes.data?.stripe_customer_id,
    monthly_usage,
    credits_this_tier: TIER_CREDITS[tier] ?? 30,
    credit_cost_examples: ACTION_COSTS,
    available_packs: AVAILABLE_PACKS,
    recent_transactions: txRes.data ?? [],
  });
}
