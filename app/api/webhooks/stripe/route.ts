import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/stripeClient";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getPlanByPriceId,
  getCreditsForPlan,
  type PlanType,
} from "@/lib/stripe/plans";

export const runtime = "nodejs";

// ── Credit pack definitions (must match purchase-pack.ts PACK_MAP) ────────────

const PACK_CREDITS: Record<string, number> = {
  small:  100,
  medium: 300,
  large:  700,
  xl:     2000,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getUserIdByEmail(email: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  return data?.id ?? null;
}

async function getUserIdByCustomer(customerId: string): Promise<string | null> {
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return null;
  const email = (customer as Stripe.Customer).email;
  if (!email) return null;
  return getUserIdByEmail(email);
}

/** Grant credits atomically: increment profiles.credits (the authoritative balance
 *  used by credit_reserve_atomic) and record in credit_transactions for audit. */
async function grantCreditsToProfile(
  userId:      string,
  amount:      number,
  type:        string,
  description: string,
): Promise<void> {
  // 1. Atomic increment on profiles.credits (what credit_reserve_atomic reads)
  const { error: rpcErr } = await supabaseAdmin.rpc("add_credits", {
    p_user_id: userId,
    p_amount:  amount,
  });
  if (rpcErr) {
    console.error(`[stripe-webhook] add_credits failed user=${userId}:`, rpcErr.message);
    // Fallback: direct update (still atomic at Postgres row level)
    const { error: fallbackErr } = await supabaseAdmin
      .from("profiles")
      .update({ credits: supabaseAdmin.rpc("add_credits" as never, { p_user_id: userId, p_amount: amount }) as never })
      .eq("id", userId);
    if (fallbackErr) console.error("[stripe-webhook] fallback credit grant failed:", fallbackErr.message);
  }

  // 2. Audit trail: insert into credit_transactions
  void supabaseAdmin.from("credit_transactions").insert({
    user_id:     userId,
    amount,
    type,
    description,
  }).then(({ error }) => {
    if (error) console.warn("[stripe-webhook] credit_transactions audit insert failed:", error.message);
  });
}

async function setUserPlan(userId: string, plan: PlanType): Promise<void> {
  const credits = getCreditsForPlan(plan);

  // Update plan tier in profiles
  const { error: planErr } = await supabaseAdmin
    .from("profiles")
    .update({ plan })
    .eq("id", userId);
  if (planErr) console.error("[stripe-webhook] setUserPlan plan update failed:", planErr.message);

  // Grant monthly credit allocation
  await grantCreditsToProfile(
    userId,
    credits,
    "subscription_grant",
    `${plan} plan activated — ${credits} credits granted`,
  );

  console.log(`[stripe-webhook] setUserPlan user=${userId} plan=${plan} credits=${credits}`);
}

async function replenishCredits(userId: string, plan: PlanType): Promise<void> {
  const credits = getCreditsForPlan(plan);
  await grantCreditsToProfile(
    userId,
    credits,
    "subscription_renewal",
    `${plan} monthly renewal — ${credits} credits`,
  );
  console.log(`[stripe-webhook] replenishCredits user=${userId} plan=${plan} credits=${credits}`);
}

async function downgradeToFree(userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ plan: "free" })
    .eq("id", userId);
  if (error) console.error("[stripe-webhook] downgradeToFree failed:", error.message);
  console.log(`[stripe-webhook] downgradeToFree user=${userId}`);
}

async function getPriceIdFromSubscription(subscriptionId: string): Promise<string | null> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });
  return (sub.items.data[0]?.price as Stripe.Price | undefined)?.id ?? null;
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.user_id ?? session.metadata?.userId;

  // ── Branch A: Credit pack purchase (mode=payment) ─────────────────────────
  const packId      = session.metadata?.pack;
  const packCredits = packId ? (PACK_CREDITS[packId] ?? parseInt(session.metadata?.credits ?? "0", 10)) : 0;

  if (packId && packCredits > 0 && userId) {
    console.log(`[stripe-webhook] credit pack userId=${userId} pack=${packId} credits=${packCredits}`);

    await grantCreditsToProfile(
      userId,
      packCredits,
      "credit_pack",
      `Credit pack "${packId}" — ${packCredits} credits`,
    );

    // Record pack purchase for audit
    void supabaseAdmin.from("credit_packs").insert({
      user_id:           userId,
      stripe_session_id: session.id,
      pack_id:           packId,
      credits:           packCredits,
      amount_cents:      session.amount_total ?? null,
      currency:          session.currency ?? null,
      status:            "completed",
    }).then(({ error }) => {
      if (error && error.code !== "23505") {  // ignore duplicate
        console.warn("[stripe-webhook] credit_packs insert failed:", error.message);
      }
    });

    return;
  }

  // ── Branch B: Subscription checkout ──────────────────────────────────────
  if (!userId) {
    console.warn("[stripe-webhook] checkout.session.completed: no metadata.user_id");
    return;
  }

  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id;

  if (!subscriptionId) {
    console.warn("[stripe-webhook] checkout.session.completed: no subscription");
    return;
  }

  const priceId = await getPriceIdFromSubscription(subscriptionId);
  const plan = priceId ? getPlanByPriceId(priceId) : null;

  if (!plan) {
    console.warn("[stripe-webhook] checkout.session.completed: unknown priceId", priceId);
    return;
  }

  // invoice.paid (billing_reason=subscription_create) fires right after —
  // suppressed below to avoid double-crediting.
  await setUserPlan(userId, plan);
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  // Only replenish on renewal cycles — NOT on initial subscription creation.
  if (invoice.billing_reason !== "subscription_cycle") return;

  const customerId = typeof invoice.customer === "string"
    ? invoice.customer
    : invoice.customer?.id;

  if (!customerId) return;

  const userId = await getUserIdByCustomer(customerId);
  if (!userId) {
    console.warn("[stripe-webhook] invoice.paid: user not found for customer", customerId);
    return;
  }

  const lineItem = invoice.lines?.data?.[0] as (Stripe.InvoiceLineItem & { price?: { id?: string } }) | undefined;
  const priceId = lineItem?.price?.id ?? null;
  const plan = priceId ? getPlanByPriceId(priceId) : null;

  if (!plan) {
    console.warn("[stripe-webhook] invoice.paid: unknown priceId", priceId);
    return;
  }

  await replenishCredits(userId, plan);
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = typeof invoice.customer === "string"
    ? invoice.customer
    : invoice.customer?.id;

  if (!customerId) return;

  const userId = await getUserIdByCustomer(customerId);
  if (!userId) return;

  await downgradeToFree(userId);
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === "string"
    ? sub.customer
    : sub.customer?.id;

  if (!customerId) return;

  const userId = await getUserIdByCustomer(customerId);
  if (!userId) return;

  await downgradeToFree(userId);
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription): Promise<void> {
  // Fires on plan change (upgrade/downgrade), pause, and other mutations.
  // We sync the plan tier immediately; credits are handled by the next invoice.paid.
  const customerId = typeof sub.customer === "string"
    ? sub.customer
    : sub.customer?.id;

  if (!customerId) return;

  const userId = await getUserIdByCustomer(customerId);
  if (!userId) return;

  // Only process active subscriptions (not cancellation — that's subscription.deleted)
  if (sub.status !== "active" && sub.status !== "trialing") return;

  const priceId = (sub.items.data[0]?.price as Stripe.Price | undefined)?.id ?? null;
  if (!priceId) return;

  const plan = getPlanByPriceId(priceId);
  if (!plan) return;

  // Get current plan to detect actual change
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();

  const currentPlan = (profile?.plan as string | undefined) ?? "free";
  if (plan === currentPlan) return;  // no change

  // Update plan tier only; credits from next billing cycle
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ plan })
    .eq("id", userId);

  if (error) {
    console.error("[stripe-webhook] subscription.updated plan change failed:", error.message);
    return;
  }

  // If this is an immediate upgrade, grant the new plan's credits now
  const PLAN_ORDER = { free: 0, starter: 1, creator: 2, studio: 3 };
  const isUpgrade = (PLAN_ORDER[plan as keyof typeof PLAN_ORDER] ?? 0) > (PLAN_ORDER[currentPlan as keyof typeof PLAN_ORDER] ?? 0);

  if (isUpgrade) {
    await replenishCredits(userId, plan);
    console.log(`[stripe-webhook] subscription.updated UPGRADE user=${userId} ${currentPlan}→${plan} credits granted`);
  } else {
    console.log(`[stripe-webhook] subscription.updated DOWNGRADE user=${userId} ${currentPlan}→${plan} plan updated`);
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return Response.json({ error: "Missing Stripe-Signature header" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe-webhook] Signature verification failed:", msg);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ── Step 1: Deduplication check ──────────────────────────────────────────
  const { data: existing } = await supabaseAdmin
    .from("stripe_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle();

  if (existing) {
    return Response.json({ ok: true, deduplicated: true });
  }

  // ── Step 2: Insert event ID FIRST — prevents replay attacks ─────────────
  const { error: insertErr } = await supabaseAdmin
    .from("stripe_events")
    .insert({ id: event.id });

  if (insertErr) {
    if (insertErr.code === "23505") {
      return Response.json({ ok: true, deduplicated: true });
    }
    console.error("[stripe-webhook] Failed to insert stripe_event:", insertErr);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }

  // ── Step 3: Dispatch ─────────────────────────────────────────────────────
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(`[stripe-webhook] Handler failed for ${event.type}:`, err);
    // Log but return 200 — Stripe would retry indefinitely on 5xx
  }

  return Response.json({ ok: true });
}
