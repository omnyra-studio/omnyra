import { createClient } from '@supabase/supabase-js';

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

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { action_type, estimated_cost_usd } = await request.json();

  if (!action_type) {
    return Response.json({ error: 'action_type is required' }, { status: 400 });
  }

  const { error } = await getDb()
    .from('usage_logs')
    .insert({
      user_id: user.id,
      action_type,
      estimated_cost_usd: estimated_cost_usd ?? null,
    });

  if (error) {
    console.error('[log-usage]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
