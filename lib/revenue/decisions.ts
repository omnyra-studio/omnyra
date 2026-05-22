/* Revenue decision engine.
 *
 * Per the "Revenue Decision Engine" spec:
 *
 *   INPUT: user_id, trigger_event ∈ { login | render_complete | credit_low | inactivity }
 *
 *   PROCESS:
 *     1. Fetch user_revenue_state (compute on miss / stale)
 *     2. Fetch recent events (last 7d) + renders + credit_transactions
 *     3. Compute decision tree
 *     4. Return + log
 *
 *   OUTPUT:
 *     { action_type: "show_upgrade" | "give_bonus_credits" | "discount_offer" | "no_action",
 *       payload: { plan?, discount_percent?, bonus_credits?, message? } }
 *
 *   RULES:
 *     R1. churn_risk_score > 70                              → give_bonus_credits
 *     R2. upgrade_probability > 60 AND user_active           → show_upgrade
 *     R3. credit_usage_spike AND no recent purchase          → discount_offer
 *     R4. low engagement AND new user                        → no_action (don't spam)
 *
 *   GUARDRAIL: max 1 action per user per 24h.
 *
 *   FAILURE CONDITION (spec): decisions outside this engine, or
 *   computed without revenue_state, are not allowed. All callers must
 *   route through `evaluateRevenueOpportunity()`.
 */

import { supabaseAdmin } from "../supabase/admin";
import { recomputeUserRevenueState } from "./state";
import { canShowOffer, classifyOfferType, logOfferShown } from "./throttle";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const OFFER_COOLDOWN_HOURS = 24;
const INACTIVE_HOURS = 72;
const NEW_USER_HOURS = 24;
const SPIKE_MULTIPLIER = 3;       // 24h usage vs 7d-daily-avg
const RECENT_PURCHASE_DAYS = 7;
const ACTIVE_HOURS = 48;          // "user active" = activity within 48h

export type RevenueTrigger =
  | "login"
  | "render_complete"
  | "credit_low"
  | "inactivity"
  | "third_video"  // legacy alias, retained for back-compat
  | "sweep"
  | "manual";

export type RevenueActionType =
  | "show_upgrade"
  | "give_bonus_credits"
  | "discount_offer"
  | "no_action";

export interface RevenuePayload {
  plan?: string;
  discount_percent?: number;
  bonus_credits?: number;
  duration_days?: number;
  message?: string;
}

export interface RevenueAction {
  action_type: RevenueActionType;
  payload: RevenuePayload;
  reason: string;
  pricing_variant?: "aggressive_upsell" | "balanced" | "retention_focus";
  rule?: "churn_intervention" | "upgrade_probability" | "credit_spike" | "reactivation" | "credit_paywall" | "viral_pro" | "cooldown" | "new_user_quiet" | "no_signal";
}

export interface EvaluateContext {
  trigger: RevenueTrigger;
}

const NO_ACTION: RevenueAction = {
  action_type: "no_action",
  payload: {},
  reason: "no_signal",
  rule: "no_signal",
};

interface RevenueStateLite {
  plan_tier: string;
  churn_risk_score: number;
  upgrade_probability: number;
  price_sensitivity: string;
  total_spent: number;
  updated_at?: string;
}

/* ─── Throttle ──────────────────────────────────────────────────── */

/* The throttle layer (offer_log + can_show_offer RPC) enforces the full
 * rate-limit policy in SQL — 24h/12h cooldown, 3/7d cap, 8/30d cap. The
 * legacy `inCooldown` 24h check is removed in favour of this single
 * gate so all three limits apply consistently. */

/* ─── Signals ───────────────────────────────────────────────────── */

async function hoursSinceLastActivity(userId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("events")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return Infinity;
  return (Date.now() - new Date(data[0].created_at).getTime()) / HOUR;
}

async function hoursSinceSignup(userId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("events")
    .select("created_at")
    .eq("user_id", userId)
    .eq("type", "user_signed_up")
    .order("created_at", { ascending: true })
    .limit(1);
  if (!data || data.length === 0) return Infinity;
  return (Date.now() - new Date(data[0].created_at).getTime()) / HOUR;
}

async function recentEngagementEvents(userId: string, hours: number = 48): Promise<number> {
  const since = new Date(Date.now() - hours * HOUR).toISOString();
  const { count } = await supabaseAdmin
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("type", ["render_completed", "video_viewed", "video_shared", "video_downloaded"])
    .gte("created_at", since);
  return count ?? 0;
}

/**
 * Credit-usage spike: 24h debit total > SPIKE_MULTIPLIER × the 7-day
 * daily average. Returns { spike: bool, recent_24h, daily_avg_7d }.
 */
async function creditUsageSpike(userId: string): Promise<{ spike: boolean; recent_24h: number; daily_avg_7d: number }> {
  const now = Date.now();
  const since7d = new Date(now - 7 * DAY).toISOString();
  const since24h = new Date(now - 24 * HOUR).toISOString();

  const { data: rows } = await supabaseAdmin
    .from("credit_transactions")
    .select("amount, created_at")
    .eq("user_id", userId)
    .lt("amount", 0)
    .gte("created_at", since7d);

  let totalWindow7d = 0;
  let total24h = 0;
  for (const r of (rows ?? []) as Array<{ amount: number; created_at: string }>) {
    const abs = Math.abs(Number(r.amount));
    totalWindow7d += abs;
    if (new Date(r.created_at).getTime() >= now - 24 * HOUR) {
      total24h += abs;
    }
  }
  const dailyAvg = totalWindow7d / 7;
  const spike = dailyAvg > 0 && total24h > SPIKE_MULTIPLIER * dailyAvg;
  return { spike, recent_24h: total24h, daily_avg_7d: dailyAvg };
}

async function hasRecentPurchase(userId: string, days: number = RECENT_PURCHASE_DAYS): Promise<boolean> {
  const since = new Date(Date.now() - days * DAY).toISOString();
  const { count } = await supabaseAdmin
    .from("credit_transactions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("type", ["subscription", "topup"])
    .gt("amount", 0)
    .gte("created_at", since);
  return (count ?? 0) > 0;
}

/* ─── State loader ──────────────────────────────────────────────── */

async function loadOrComputeState(userId: string): Promise<RevenueStateLite | null> {
  const { data } = await supabaseAdmin
    .from("user_revenue_state")
    .select("plan_tier, churn_risk_score, upgrade_probability, price_sensitivity, total_spent, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (data) {
    const ageHours = (Date.now() - new Date(data.updated_at).getTime()) / HOUR;
    if (ageHours < 12) return data as RevenueStateLite;
  }
  const fresh = await recomputeUserRevenueState(userId);
  if (!fresh) return null;
  return {
    plan_tier: fresh.plan_tier,
    churn_risk_score: fresh.churn_risk_score,
    upgrade_probability: fresh.upgrade_probability,
    price_sensitivity: fresh.price_sensitivity,
    total_spent: fresh.total_spent,
  };
}

function variantFor(state: RevenueStateLite): RevenueAction["pricing_variant"] {
  if (state.churn_risk_score >= 60) return "retention_focus";
  if (state.upgrade_probability >= 60) return "aggressive_upsell";
  return "balanced";
}

/* ─── Logging ───────────────────────────────────────────────────── */

export async function logRevenueEvent(
  userId: string,
  event_type: string,
  body: Partial<{
    action_type: string;
    payload: RevenuePayload | null;
    context: Record<string, unknown>;
    source_event_id: string;
  }>,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("revenue_events")
    .insert({
      user_id: userId,
      event_type,
      action_type: body.action_type ?? null,
      // revenue_events.offer column stores the structured payload (legacy
      // name for back-compat).
      offer: body.payload ?? null,
      context: body.context ?? {},
      source_event_id: body.source_event_id ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[revenue_events] insert failed:", error.message);
    return null;
  }
  return data?.id ?? null;
}

async function stampLastOffer(userId: string, action_type: string): Promise<void> {
  await supabaseAdmin
    .from("user_revenue_state")
    .update({
      last_offer_type: action_type,
      last_offer_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}

/**
 * Atomic side-effect bundle when an offer is shown: append revenue_events
 * row + append offer_log row + stamp user_revenue_state. Returns the
 * revenue_events id (or null on error).
 */
async function recordOfferShown(
  userId: string,
  action: RevenueAction,
  ctx: EvaluateContext,
): Promise<string | null> {
  const eventId = await logRevenueEvent(userId, "offer_shown", {
    action_type: action.action_type,
    payload: action.payload,
    context: { trigger: ctx.trigger, rule: action.rule },
  });
  const offerType = classifyOfferType({
    action_type: action.action_type,
    rule: action.rule,
  });
  if (offerType) {
    await logOfferShown(userId, offerType, eventId);
  }
  await stampLastOffer(userId, action.action_type);
  return eventId;
}

/* ─── Engine ────────────────────────────────────────────────────── */

export async function evaluateRevenueOpportunity(
  userId: string,
  ctx: EvaluateContext,
): Promise<RevenueAction> {
  // Throttle — single SQL-side check enforces 24h/12h cooldown +
  // 3/7d weekly cap + 8/30d monthly cap. NEVER bypass this; it is the
  // UX guardrail that prevents offer spam.
  const throttle = await canShowOffer(userId);
  if (!throttle.allowed) {
    return {
      ...NO_ACTION,
      reason: `throttled:${throttle.reason}${throttle.cooldown_remaining ? `:cooldown=${throttle.cooldown_remaining}s` : ""}`,
      rule: "cooldown",
      pricing_variant: "balanced",
    };
  }

  const state = await loadOrComputeState(userId);
  if (!state) return NO_ACTION;

  const pricing_variant = variantFor(state);

  // R4 pre-check: low engagement + new user → stay quiet.
  const signupAgeHours = await hoursSinceSignup(userId);
  const recentEngagement = await recentEngagementEvents(userId, 48);
  if (signupAgeHours < NEW_USER_HOURS && recentEngagement < 2) {
    return {
      ...NO_ACTION,
      reason: `new_user_low_engagement age=${signupAgeHours.toFixed(1)}h engagement=${recentEngagement}`,
      rule: "new_user_quiet",
      pricing_variant,
    };
  }

  // R1 — Churn intervention (highest priority).
  if (state.churn_risk_score > 70) {
    const action: RevenueAction = {
      action_type: "give_bonus_credits",
      payload: {
        bonus_credits: 25,
        message: "We've topped up your account — get back to creating.",
      },
      reason: `churn_risk=${state.churn_risk_score}`,
      rule: "churn_intervention",
      pricing_variant,
    };
    const id = await recordOfferShown(userId, action, ctx);
    return { ...action, reason: `${action.reason}|event=${id}` };
  }

  // R2 — Strong upgrade signal: upgrade_probability > 60 AND user_active.
  const userActive = recentEngagement > 0 || (await hoursSinceLastActivity(userId)) < ACTIVE_HOURS;
  if (state.upgrade_probability > 60 && userActive && state.plan_tier !== "studio") {
    const targetPlan = state.plan_tier === "free" ? "creator"
      : state.plan_tier === "creator" ? "pro"
      : "studio";
    const discount = state.price_sensitivity === "high" ? 20
      : state.price_sensitivity === "medium" ? 10
      : 0;
    const action: RevenueAction = {
      action_type: "show_upgrade",
      payload: {
        plan: targetPlan,
        discount_percent: discount,
        message: discount > 0
          ? `Upgrade to ${targetPlan} — ${discount}% off your first month.`
          : `You're getting strong reach. ${targetPlan.charAt(0).toUpperCase()}${targetPlan.slice(1)} unlocks higher quality and more credits.`,
      },
      reason: `upgrade_prob=${state.upgrade_probability} active=${userActive}`,
      rule: "upgrade_probability",
      pricing_variant,
    };
    const id = await recordOfferShown(userId, action, ctx);
    return { ...action, reason: `${action.reason}|event=${id}` };
  }

  // R3 — Credit usage spike with no recent purchase → discount.
  const spike = await creditUsageSpike(userId);
  if (spike.spike && state.plan_tier !== "studio") {
    const recentPurchase = await hasRecentPurchase(userId);
    if (!recentPurchase) {
      const targetPlan = state.plan_tier === "free" ? "creator"
        : state.plan_tier === "creator" ? "pro"
        : "studio";
      const action: RevenueAction = {
        action_type: "discount_offer",
        payload: {
          plan: targetPlan,
          discount_percent: 15,
          duration_days: 7,
          message: "You're burning through credits — grab 15% off this week.",
        },
        reason: `credit_spike 24h=${spike.recent_24h} avg=${spike.daily_avg_7d.toFixed(1)}`,
        rule: "credit_spike",
        pricing_variant,
      };
      const id = await recordOfferShown(userId, action, ctx);
      return { ...action, reason: `${action.reason}|event=${id}` };
    }
  }

  // Reactivation — inactive over 72h. Activated by trigger=inactivity
  // or detected on any other trigger that meets the threshold.
  const idleHours = ctx.trigger === "inactivity" ? Infinity : await hoursSinceLastActivity(userId);
  if (idleHours > INACTIVE_HOURS) {
    const action: RevenueAction = {
      action_type: "discount_offer",
      payload: {
        plan: "creator",
        discount_percent: 25,
        bonus_credits: 10,
        duration_days: 7,
        message: "Welcome back — here are some credits and 25% off Creator.",
      },
      reason: `inactive_${Math.round(idleHours)}h`,
      rule: "reactivation",
      pricing_variant: "retention_focus",
    };
    const id = await recordOfferShown(userId, action, ctx);
    return { ...action, reason: `${action.reason}|event=${id}` };
  }

  return { ...NO_ACTION, pricing_variant };
}
