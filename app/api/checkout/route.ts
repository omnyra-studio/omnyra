import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { stripe } from "@/lib/stripe/stripeClient";
import { PLAN_CONFIG, type PlanType } from "@/lib/stripe/plans";

const VALID_PLANS: PlanType[] = ["starter", "creator", "studio"];

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let plan: string;
  try {
    const body = await req.json() as { plan?: string };
    plan = (body.plan ?? "").trim().toLowerCase();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Server-authoritative validation — never trust the frontend's plan value
  if (!VALID_PLANS.includes(plan as PlanType)) {
    return Response.json({ error: "invalid_plan" }, { status: 400 });
  }

  const planConfig = PLAN_CONFIG[plan as PlanType];
  const priceId = planConfig.stripePriceId;
  if (!priceId) {
    return Response.json(
      { error: "plan_not_configured", detail: `STRIPE_PRICE_${plan.toUpperCase()} env var missing` },
      { status: 500 },
    );
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return Response.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const origin = req.headers.get("origin") ?? "https://omnyra.studio";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.email ?? undefined,
      // metadata.user_id is what the webhook reads to link the subscription to a user
      metadata: { user_id: user.id, plan },
      subscription_data: { metadata: { user_id: user.id, plan } },
      success_url: `${origin}/dashboard?success=true`,
      cancel_url: `${origin}/pricing`,
      allow_promotion_codes: true,
    });

    return Response.json({ checkoutUrl: session.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe session creation failed";
    console.error("[checkout] Stripe error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
