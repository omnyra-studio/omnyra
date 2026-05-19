import { supabaseAdmin } from '../../../../lib/supabase-admin';
import { sendMonthlySummary } from '../../../../lib/email.js';
import { PLAN_LIMITS } from '../../../../lib/credits.js';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request) {
  // Verify cron secret
  const auth = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Previous calendar month
  const now = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth(); // 1-12
  const start = new Date(year, month - 1, 1).toISOString();
  const end = new Date(year, month, 1).toISOString();

  try {
    // Fetch all users (Supabase admin list, paginated up to 1000)
    const { data: { users }, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersErr) throw usersErr;

    // Fetch all credit balances in one query
    const { data: credits } = await supabaseAdmin
      .from('credits')
      .select('user_id, balance, plan');

    // Fetch all usage transactions for last month in one query
    const { data: transactions } = await supabaseAdmin
      .from('credit_transactions')
      .select('user_id, amount')
      .eq('type', 'usage')
      .gte('created_at', start)
      .lt('created_at', end);

    // Aggregate credits used per user
    const usageByUser = {};
    for (const tx of transactions ?? []) {
      usageByUser[tx.user_id] = (usageByUser[tx.user_id] ?? 0) + Math.abs(tx.amount);
    }

    // Build credit map
    const creditMap = {};
    for (const c of credits ?? []) {
      creditMap[c.user_id] = c;
    }

    // Send summaries — skip users with zero usage last month
    let sent = 0;
    let failed = 0;

    for (const user of users) {
      if (!user.email) continue;
      const credit = creditMap[user.id];
      if (!credit) continue;

      const creditsUsed = usageByUser[user.id] ?? 0;
      if (creditsUsed === 0) continue; // no activity last month — skip

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
