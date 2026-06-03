import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/stripeClient";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getPlanByPriceId,
  getCreditsForPlan,
  type PlanType,
} from "@/lib/stripe/plans";

export const runtime = "nodejs";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getUserIdByEmail(email: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("users")
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

async function setUserPlan(userId: string, plan: PlanType): Promise<void> {
  const credits = getCreditsForPlan(plan);
  await supabaseAdmin
    .from("users")
    .update({ plan_type: plan, credits_balance: credits })
    .eq("id", userId);
}

async function downgradeToFree(userId: string): Promise<void> {
  await setUserPlan(userId, "free");
}

async function replenishCredits(userId: string, plan: PlanType): Promise<void> {
  const credits = getCreditsForPlan(plan);
  await supabaseAdmin
    .from("users")
    .update({ credits_balance: credits })
    .eq("id", userId);
}

async function getPriceIdFromSubscription(subscriptionId: string): Promise<string | null> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });
  return (sub.items.data[0]?.price as Stripe.Price | undefined)?.id ?? null;
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  // metadata.user_id must be set to the Supabase auth user ID during checkout session creation
  const userId = session.metadata?.user_id;
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

  // Set plan_type and initial credits. invoice.paid (billing_reason=subscription_create)
  // fires right after — it's suppressed below to avoid double-crediting.
  await setUserPlan(userId, plan);
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  // Only replenish on renewal cycles — NOT on initial subscription creation.
  // checkout.session.completed already set credits for the first billing period.
  // billing_reason "subscription_create" = first invoice; "subscription_cycle" = renewal.
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
      // Another request inserted it in the same millisecond — safe to ignore
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
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      default:
        // Unhandled event type — acknowledged, not processed
        break;
    }
  } catch (err) {
    console.error(`[stripe-webhook] Handler failed for ${event.type}:`, err);
    // Do NOT return 500 here — that would cause Stripe to retry indefinitely.
    // The event is already deduped, so retries won't reprocess it anyway.
    // Log and return 200 to stop retries.
  }

  return Response.json({ ok: true });
}
