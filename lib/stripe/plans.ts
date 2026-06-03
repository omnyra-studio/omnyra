export type PlanType = "free" | "starter" | "creator" | "studio";

export interface PlanConfig {
  creditsPerMonth: number;
  stripePriceId: string | undefined;
}

export const PLAN_CONFIG: Record<PlanType, PlanConfig> = {
  free:    { creditsPerMonth: 40,  stripePriceId: undefined },
  starter: { creditsPerMonth: 100, stripePriceId: process.env.STRIPE_PRICE_STARTER },
  creator: { creditsPerMonth: 350, stripePriceId: process.env.STRIPE_PRICE_CREATOR },
  studio:  { creditsPerMonth: 900, stripePriceId: process.env.STRIPE_PRICE_STUDIO },
};

export function getPlanByPriceId(priceId: string): PlanType | null {
  for (const [plan, config] of Object.entries(PLAN_CONFIG)) {
    if (config.stripePriceId && config.stripePriceId === priceId) {
      return plan as PlanType;
    }
  }
  return null;
}

export function getCreditsForPlan(plan: PlanType): number {
  return PLAN_CONFIG[plan].creditsPerMonth;
}
