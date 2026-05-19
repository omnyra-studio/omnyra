/*
  Required Supabase migration — run once in the SQL editor:

  alter table profiles
    add column if not exists stripe_customer_id text,
    add column if not exists stripe_subscription_id text;

  create index if not exists profiles_stripe_customer_id_idx
    on profiles (stripe_customer_id);
*/

import Stripe from 'stripe';
import { supabaseAdmin } from '../../../../lib/supabase-admin';
import { sendSubscriptionConfirmation } from '../../../../lib/email.js';

let _stripe = null
function getStripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  return _stripe
}

const PLAN_CREDITS = {
  creator: 200,
  pro:     500,
  studio:  1500,
  free:    50,
};

function planKey(str = '') {
  const s = str.toLowerCase();
  if (s.includes('studio'))  return 'studio';
  if (s.includes('pro'))     return 'pro';
  if (s.includes('creator')) return 'creator';
  return 'free';
}

async function findUserIdByEmail(email) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserByEmail(email);
  if (error || !data?.user) return null;
  return data.user.id;
}

async function findUserIdByCustomerId(customerId) {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();
  return data?.id ?? null;
}

async function applyPlan(userId, plan, customerId, subscriptionId) {
  const balance = PLAN_CREDITS[plan] ?? 50;

  // Update plan + Stripe IDs on profile
  await supabaseAdmin
    .from('profiles')
    .update({
      plan,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId ?? null,
    })
    .eq('id', userId);

  // Reset credit balance + mirror plan in the credits table
  await supabaseAdmin
    .from('credits')
    .upsert({ user_id: userId, balance, plan, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

  await supabaseAdmin.from('credit_transactions').insert({
    user_id: userId,
    amount: balance,
    type: 'subscription',
    description: `${plan} plan activated`,
  });
}

export async function POST(request) {
  const body = await request.text();
  const sig  = request.headers.get('stripe-signature');

  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  try {
    switch (event.type) {

      // ── Payment completed → activate subscription ──────────────────
      case 'checkout.session.completed': {
        const session = event.data.object;
        const email   = session.customer_details?.email ?? session.customer_email;
        const plan    = planKey(session.metadata?.plan ?? '');

        const userId = await findUserIdByEmail(email);
        if (userId) {
          await applyPlan(userId, plan, session.customer, session.subscription);
          if (email) {
            sendSubscriptionConfirmation(email, { plan, credits: PLAN_CREDITS[plan] ?? 50 })
              .catch(err => console.error('[email] Subscription confirmation failed:', err.message));
          }
        } else {
          console.warn('checkout.session.completed: no user found for', email);
        }
        break;
      }

      // ── Subscription changed (upgrade / downgrade / renewal) ───────
      case 'customer.subscription.updated': {
        const sub    = event.data.object;
        const plan   = sub.status === 'active'
          ? planKey(sub.metadata?.plan ?? '')
          : 'free';

        const userId = await findUserIdByCustomerId(sub.customer);
        if (userId) {
          await applyPlan(userId, plan, sub.customer, sub.id);
        } else {
          console.warn('subscription.updated: no user found for customer', sub.customer);
        }
        break;
      }

      // ── Subscription cancelled / expired → free tier ───────────────
      case 'customer.subscription.deleted': {
        const sub    = event.data.object;
        const userId = await findUserIdByCustomerId(sub.customer);
        if (userId) {
          await applyPlan(userId, 'free', sub.customer, null);
        }
        break;
      }

      // ── Payment failed → log (extend here to email the user) ───────
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        console.error(
          `Payment failed — customer: ${invoice.customer}, email: ${invoice.customer_email}, amount: ${invoice.amount_due}`
        );
        break;
      }

      default:
        // Unhandled event types are silently ignored
        break;
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    return new Response('Handler error', { status: 500 });
  }

  return new Response('ok', { status: 200 });
}
