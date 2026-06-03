import Stripe from "stripe";

if (typeof window !== "undefined") {
  throw new Error(
    "[lib/stripe] Stripe client imported from browser — server only",
  );
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
  typescript: true,
});
