import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CREDIT_COSTS } from './credits';

// Actions that never cost credits — the user's hook into Omnyra
const FREE_ACTIONS = new Set([
  'script', 'caption', 'brief', 'hook', 'hook_selection',
  'rewrite', 'shot_plan',
]);

function getDb(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function getAuthUser(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await getDb().auth.getUser(token);
  return user ?? null;
}

interface GateResult {
  user: Awaited<ReturnType<typeof getAuthUser>>;
  cost: number;
  error?: NextResponse;
}

/**
 * Run before any generation endpoint. Returns the authenticated user and
 * the credit cost. If the user can't afford the action, returns a 402 with
 * redirect hints. Scripts/briefs/hooks always pass for free.
 *
 * Design principle: deduct BEFORE rendering. Never block a render in
 * progress — this gate runs at the start of the request.
 */
export async function creditGate(
  request: NextRequest,
  action: string
): Promise<GateResult> {
  const db = getDb();
  const token = request.headers.get('authorization')?.replace('Bearer ', '');

  if (!token) {
    return {
      user: null,
      cost: 0,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { data: { user }, error: authErr } = await db.auth.getUser(token);
  if (authErr || !user) {
    return {
      user: null,
      cost: 0,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  // Free actions bypass credit check entirely
  if (FREE_ACTIONS.has(action)) {
    return { user, cost: 0 };
  }

  const cost = (CREDIT_COSTS as Record<string, number>)[action] ?? 0;
  if (cost === 0) return { user, cost: 0 };

  const { data: creditsRow } = await db
    .from('credits')
    .select('balance')
    .eq('user_id', user.id)
    .single();

  const balance = creditsRow?.balance ?? 0;

  if (balance < cost) {
    console.warn(`[creditGate] User ${user.id} insufficient credits — needs ${cost}, has ${balance} (action: ${action})`);
    return {
      user,
      cost,
      error: NextResponse.json(
        {
          error: 'Insufficient credits',
          creditsNeeded: cost,
          currentBalance: balance,
          upgradeUrl: '/account/billing',
          packUrl: '/api/billing/purchase-pack',
        },
        { status: 402 }
      ),
    };
  }

  return { user, cost };
}
