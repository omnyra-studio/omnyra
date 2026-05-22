/*
  Stripe webhook handler.
  ----------------------
  Credit semantics (post credit_ledger.sql migration):
    - `credit_transactions` is the ONLY mechanism that mutates balances.
    - The DB trigger trg_apply_credit_transaction maintains credits.balance
      as a cache from the ledger.
    - This handler MUST NOT write credits.balance directly. Doing so
      double-counts because the trigger applies the ledger row on top
      of the manual update.

  Event emission (per Analytics Aggregation spec — "events ONLY"):
    - subscription_purchased / subscription_renewed / subscription_canceled
    - topup_purchased
    - payment_failed
    These feed the revenue_per_user metric in analytics_snapshots.
*/

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { sendSubscriptionConfirmation } from '../../../../lib/email.js';
import { trackEvent } from '../../../../lib/events/trackEvent';

const PLAN_CREDITS = {
  creator: 200,
  pro:     500,
  studio:  1500,
  free:    50,
};

// Approximate USD-per-credit for revenue snapshots. Sourced from env so
// pricing tweaks don't require a code change.
function pricePerCredit() {
  return Number(process.env.REVENUE_PRICE_PER_CREDIT ?? '0.10');
}

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function planKey(str = '') {
  const s = str.toLowerCase();
  if (s.includes('studio'))  return 'studio';
  if (s.includes('pro'))     return 'pro';
  if (s.includes('creator')) return 'creator';
  return 'free';
}

async function findUserIdByEmail(db, email) {
  const { data, error } = await db.auth.admin.getUserByEmail(email);
  if (error || !data?.user) return null;
  return data.user.id;
}

async function findUserIdByCustomerId(db, customerId) {
  const { data } = await db
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();
  return data?.id ?? null;
}

/**
 * Apply a plan change. The ledger insert is the SOLE balance mutator;
 * the trigger updates credits.balance from it. We still write
 * stripe_customer_id / plan onto profiles and credits.plan (a metadata
 * column, not the balance).
 *
 * Plan-change semantics: credits are ADDITIVE. Upgrading mid-cycle keeps
 * the user's existing balance and adds the new plan's allotment. This
 * avoids the destructive "replace balance" path that would otherwise
 * conflict with the ledger.
 */
async function applyPlan(db, userId, plan, customerId, subscriptionId, eventType /* 'subscription_purchased' | 'subscription_renewed' | 'subscription_canceled' */) {
  const credits = PLAN_CREDITS[plan] ?? 0;

  await db
    .from('profiles')
    .update({
      plan,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId ?? null,
    })
    .eq('id', userId);

  // Keep `plan` column in sync on credits for routes that read it for
  // plan-limit lookups; do NOT touch `balance` here.
  await db
    .from('credits')
    .upsert(
      { user_id: userId, plan, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );

  if (credits > 0) {
    await db.from('credit_transactions').insert({
      user_id: userId,
      amount: credits,
      type: 'subscription',
      description: `${plan} plan ${eventType === 'subscription_renewed' ? 'renewed' : 'activated'}`,
    });

    // Event-stream emission — revenue_per_user reads from here.
    await trackEvent(userId, eventType, {
      plan,
      credits_granted: credits,
      revenue_usd: credits * pricePerCredit(),
      stripe_customer_id: customerId ?? null,
      stripe_subscription_id: subscriptionId ?? null,
    });
  } else if (eventType === 'subscription_canceled') {
    await trackEvent(userId, 'subscription_canceled', {
      plan,
      stripe_customer_id: customerId ?? null,
    });
  }
}

/**
 * One-time credit pack purchase. Single ledger insert; trigger updates
 * balance. Emits topup_purchased for analytics.
 */
async function addCreditPack(db, userId, credits) {
  if (!credits || credits <= 0) return;

  await db.from('credit_transactions').insert({
    user_id: userId,
    amount: credits,
    type: 'topup',
    description: `Credit pack: +${credits} credits`,
  });

  await trackEvent(userId, 'topup_purchased', {
    credits_granted: credits,
    revenue_usd: credits * pricePerCredit(),
  });
}

export async function POST(request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const body = await request.text();
  const sig  = request.headers.get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const db = getDb();

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;
        const email   = session.customer_details?.email ?? session.customer_email;

        // Credit pack — one-time payment
        if (session.mode === 'payment') {
          const credits = parseInt(session.metadata?.credits ?? '0', 10);
          const userId  = session.metadata?.userId
            ?? await findUserIdByEmail(db, email);

          if (!userId || !credits) {
            console.warn('checkout.session.completed (payment): missing userId or credits', { userId, credits, email });
            break;
          }

          await addCreditPack(db, userId, credits);
          console.log(`[stripe] Added ${credits} credits to user ${userId}`);
          break;
        }

        // Subscription checkout — first activation
        const plan   = planKey(session.metadata?.plan ?? session.metadata?.pack ?? '');
        const userId = session.metadata?.userId
          ?? await findUserIdByEmail(db, email);

        if (userId) {
          await applyPlan(db, userId, plan, session.customer, session.subscription, 'subscription_purchased');
          if (email) {
            sendSubscriptionConfirmation(email, { plan, credits: PLAN_CREDITS[plan] ?? 50 })
              .catch(err => console.error('[email] Subscription confirmation failed:', err.message));
          }
        } else {
          console.warn('checkout.session.completed (subscription): no user found for', email);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub  = event.data.object;
        const isActive = sub.status === 'active';
        const plan = isActive ? planKey(sub.metadata?.plan ?? '') : 'free';

        const userId = await findUserIdByCustomerId(db, sub.customer);
        if (userId) {
          await applyPlan(
            db,
            userId,
            plan,
            sub.customer,
            sub.id,
            isActive ? 'subscription_renewed' : 'subscription_canceled',
          );
        } else {
          console.warn('subscription.updated: no user found for customer', sub.customer);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub    = event.data.object;
        const userId = await findUserIdByCustomerId(db, sub.customer);
        if (userId) {
          await applyPlan(db, userId, 'free', sub.customer, null, 'subscription_canceled');
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const userId = await findUserIdByCustomerId(db, invoice.customer);
        console.error(
          `Payment failed — customer: ${invoice.customer}, email: ${invoice.customer_email}, amount: ${invoice.amount_due}`
        );
        if (userId) {
          await trackEvent(userId, 'payment_failed', {
            stripe_customer_id: invoice.customer ?? null,
            amount_due: invoice.amount_due ?? null,
            currency: invoice.currency ?? null,
          });
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    return new Response('Handler error', { status: 500 });
  }

  return new Response('ok', { status: 200 });
}
