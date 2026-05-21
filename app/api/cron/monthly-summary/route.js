import { createClient } from '@supabase/supabase-js';
import { sendMonthlySummary } from '../../../../lib/email.js';
import { PLAN_LIMITS } from '../../../../lib/credits.js';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const now = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  const start = new Date(year, month - 1, 1).toISOString();
  const end = new Date(year, month, 1).toISOString();

  try {
    const { data: { users }, error: usersErr } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersErr) throw usersErr;

    const { data: credits } = await db
      .from('credits')
      .select('user_id, balance, plan');

    const { data: transactions } = await db
      .from('credit_transactions')
      .select('user_id, amount')
      .eq('type', 'usage')
      .gte('created_at', start)
      .lt('created_at', end);

    const usageByUser = {};
    for (const tx of transactions ?? []) {
      usageByUser[tx.user_id] = (usageByUser[tx.user_id] ?? 0) + Math.abs(tx.amount);
    }

    const creditMap = {};
    for (const c of credits ?? []) {
      creditMap[c.user_id] = c;
    }

    let sent = 0;
    let failed = 0;

    for (const user of users) {
      if (!user.email) continue;
      const credit = creditMap[user.id];
      if (!credit) continue;

      const creditsUsed = usageByUser[user.id] ?? 0;
      if (creditsUsed === 0) continue;

      const plan = credit.plan ?? 'free';
      const planCredits = PLAN_LIMITS[plan]?.credits ?? 50;

      const result = await sendMonthlySummary(user.email, {
        plan,
        creditsUsed,
        creditsRemaining: credit.balance,
        planCredits,
        month,
        year,
      });

      result.success ? sent++ : failed++;
    }

    console.log(`[monthly-summary] ${month}/${year} — sent: ${sent}, failed: ${failed}`);
    return Response.json({ ok: true, month, year, sent, failed });
  } catch (err) {
    console.error('[monthly-summary] Error:', err.message);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
