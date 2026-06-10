/**
 * Tier-aware rate limiter.
 *
 * Limits per window (sliding 60-second window):
 *   free     → 10 req / 60s
 *   starter  → 30 req / 60s
 *   creator  → 60 req / 60s
 *   studio   → 120 req / 60s
 *   unknown  → 5 req / 60s (safe fallback)
 *
 * Implemented via the api_rate_limits table so it works across
 * multiple serverless instances.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

const WINDOW_SECONDS = 60;

const TIER_LIMITS: Record<string, number> = {
  free:    10,
  starter: 30,
  creator: 60,
  studio:  120,
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export async function checkRateLimit(
  userId: string,
  plan: string,
  endpoint: string,
): Promise<RateLimitResult> {
  const limit = TIER_LIMITS[plan] ?? 5;
  const windowStart = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();

  // Count requests in the current window
  const { count } = await supabaseAdmin
    .from("api_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("endpoint", endpoint)
    .gte("created_at", windowStart);

  const current = count ?? 0;
  const allowed = current < limit;

  if (allowed) {
    // Record this request — fire and forget to keep latency low
    void supabaseAdmin.from("api_rate_limits").insert({
      user_id:  userId,
      endpoint,
    }).then(() => {});
  }

  const resetAt = new Date(Date.now() + WINDOW_SECONDS * 1000);
  return {
    allowed,
    remaining: Math.max(0, limit - current - (allowed ? 1 : 0)),
    resetAt,
  };
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset":     String(Math.floor(result.resetAt.getTime() / 1000)),
    "Retry-After":           result.allowed ? "" : String(WINDOW_SECONDS),
  };
}
