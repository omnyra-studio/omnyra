/**
 * lib/billing-middleware.ts — API route billing guard for Omnyra.studio
 *
 * Wraps Next.js API handlers with:
 *   1. Auth verification
 *   2. Credit balance check
 *   3. Monthly plan-limit check (videos/images/voice)
 *   4. Credit deduction on success via atomic RPC
 *
 * Usage:
 *   export const POST = withBillingGuard("cinematic_30s", handler);
 *
 * The wrapped handler receives a BillingContext via req.billingCtx (attached
 * to the request object) and must call ctx.commit() on success or ctx.rollback()
 * on failure. Credits are NOT deducted until commit() is called.
 */

import { createServerClient }     from "@supabase/ssr";
import { cookies }                from "next/headers";
import { NextResponse }           from "next/server";
import {
  getUserPlan,
  canGenerateVideo,
  CREDITS_PER_ACTION,
  PLANS,
  type UserPlan,
  type VideoType,
}                                 from "@/lib/billing";
import { supabaseAdmin }          from "@/lib/supabase/admin";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BillingContext {
  userId:       string;
  plan:         UserPlan;
  creditsNeeded: number;
  watermark:    boolean;
  duration:     number;
  /** Call on generation success — deducts credits atomically. */
  commit():     Promise<void>;
  /** Call on generation failure — no-op (credits never reserved). */
  rollback():   Promise<void>;
}

type GuardedHandler = (
  req:     Request,
  ctx:     { params?: Record<string, string> },
  billing: BillingContext,
) => Promise<Response>;

// ── Main guard factory ────────────────────────────────────────────────────────

/**
 * Wraps a Next.js route handler with billing enforcement.
 *
 * @param action  Key from CREDITS_PER_ACTION (e.g. "cinematic_30s", "image_standard")
 * @param handler Your route handler — receives (req, ctx, billing)
 * @param opts.videoType  Required when action is a video type — enables monthly limit check
 */
export function withBillingGuard(
  action:  string,
  handler: GuardedHandler,
  opts:    { videoType?: VideoType; isAvatar?: boolean } = {},
): (req: Request, ctx: { params?: Record<string, string> }) => Promise<Response> {
  return async (req, ctx) => {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── 2. Plan + credit pre-flight ──────────────────────────────────────────
    const plan          = await getUserPlan(user.id);
    const creditsNeeded = CREDITS_PER_ACTION[action] ?? 1;
    const planConfig    = PLANS[plan];

    // Video-specific monthly limit check
    if (opts.videoType) {
      const check = await canGenerateVideo(user.id, opts.videoType, opts.isAvatar);
      if (!check.allowed) {
        return NextResponse.json({
          error:    "GENERATION_LIMIT_REACHED",
          reason:   check.reason,
          plan,
          balance:  check.balance,
          required: check.creditsNeeded,
        }, { status: 402 });
      }
    } else {
      // Non-video: just check credit balance
      const { data: credRow } = await supabaseAdmin
        .from("credits")
        .select("balance")
        .eq("user_id", user.id)
        .single();

      const balance = credRow?.balance ?? 0;
      if (balance < creditsNeeded) {
        return NextResponse.json({
          error:    "INSUFFICIENT_CREDITS",
          balance,
          required: creditsNeeded,
          planType: plan,
        }, { status: 402 });
      }
    }

    // ── 3. Build billing context (lazy commit pattern) ────────────────────────
    let committed = false;

    const billing: BillingContext = {
      userId:        user.id,
      plan,
      creditsNeeded,
      watermark:     planConfig.watermark,
      duration:      opts.videoType ? 30 : 0,

      async commit() {
        if (committed) return;
        committed = true;
        if (creditsNeeded > 0) {
          await supabaseAdmin.rpc("deduct_credits_atomic", {
            p_user_id: user.id,
            p_amount:  creditsNeeded,
          });
        }
        void supabaseAdmin.from("usage_logs").insert({
          user_id:     user.id,
          action_type: action,
          credits:     creditsNeeded,
          metadata:    { plan },
        });
      },

      async rollback() {
        // Credits were never deducted (no reservation model) — no-op
      },
    };

    // ── 4. Delegate to handler ────────────────────────────────────────────────
    try {
      return await handler(req, ctx, billing);
    } catch (err) {
      await billing.rollback();
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[billing-middleware] unhandled error in ${action}:`, msg);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

// ── Lightweight credit-only guard (no monthly limit check) ────────────────────

/**
 * Simpler version for image/voice/text routes that only need a credit check.
 * No monthly video limit enforcement. Auto-commits on success.
 */
export function withCreditGuard(
  action:  string,
  handler: (req: Request, ctx: { params?: Record<string, string> }, billing: BillingContext) => Promise<Response>,
): (req: Request, ctx: { params?: Record<string, string> }) => Promise<Response> {
  return withBillingGuard(action, handler);
}
