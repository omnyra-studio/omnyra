// Run supabase/setup.sql once in the Supabase SQL editor before using this route.

import { createClient } from '@supabase/supabase-js';
import { deductCredits } from '../../../lib/credits';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function getUserFromRequest(request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await getDb().auth.getUser(token);
  return user ?? null;
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await getDb()
    .from('credits')
    .select('balance, plan')
    .eq('user_id', user.id)
    .single();

  return Response.json({ balance: data?.balance ?? 0, plan: data?.plan ?? 'free' });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { action } = await request.json();
  const result = await deductCredits(user.id, action);

  if (!result.success) {
    return Response.json({ error: result.error, balance: result.balance }, { status: 402 });
  }

  return Response.json({ balance: result.remaining, cost: result.cost });
}
