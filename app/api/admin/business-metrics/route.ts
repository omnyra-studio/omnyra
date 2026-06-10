/**
 * GET /api/admin/business-metrics
 *
 * Founder-only endpoint for business intelligence:
 * MRR, user stats, generation costs, credit usage, top users, recent activity.
 * Protected by ADMIN_EMAIL env var (same guard as /api/admin/metrics).
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";

// Plan prices in AUD — update when Stripe prices change
const PLAN_PRICES_AUD: Record<string, number> = {
  starter: 19,
  creator: 39,
  studio:  99,
};

async function requireAdmin(): Promise<boolean> {
  if (!ADMIN_EMAIL) return false;
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return !!(user?.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
}

export async function GET() {
  if (!(await requireAdmin())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const now   = new Date();
  const ago7d  = new Date(now.getTime() - 7  * 24 * 3600 * 1000).toISOString();
  const ago30d = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();

  const [
    profilesResult,
    rendersResult,
    renders30dResult,
    generationHistoryResult,
    creditPacksResult,
    creditTransResult,
    topUsersResult,
    recentRendersResult,
  ] = await Promise.all([
    // User counts by plan
    supabaseAdmin.from("profiles").select("plan, created_at", { count: "exact" }),

    // All-time render count
    supabaseAdmin.from("renders").select("id", { count: "exact" }).limit(1),

    // Renders last 30 days
    supabaseAdmin.from("renders").select("id", { count: "exact" }).gte("completed_at", ago30d).limit(1),

    // Generation history for cost and provider stats (last 30d)
    supabaseAdmin
      .from("generation_history")
      .select("provider, generation_ms, credits_spent, status, created_at")
      .gte("created_at", ago30d)
      .eq("status", "completed"),

    // Credit packs purchased (all time)
    supabaseAdmin.from("credit_packs").select("credits, amount_cents, created_at"),

    // Credit transactions audit (last 30d)
    supabaseAdmin
      .from("credit_transactions")
      .select("amount, type, created_at")
      .gte("created_at", ago30d)
      .order("created_at", { ascending: false })
      .limit(500),

    // Top 10 users by credits spent (last 30d)
    supabaseAdmin
      .from("credit_reservations")
      .select("user_id, credits")
      .eq("status", "finalized")
      .gte("created_at", ago30d)
      .limit(1000),

    // 20 most recent renders for the activity table
    supabaseAdmin
      .from("renders")
      .select("id, user_id, template, video_url, completed_at")
      .order("completed_at", { ascending: false })
      .limit(20),
  ]);

  // ── User metrics ──────────────────────────────────────────────────────────
  const profiles = (profilesResult.data ?? []) as { plan: string; created_at: string }[];
  const planCounts: Record<string, number> = { free: 0, starter: 0, creator: 0, studio: 0 };
  let newUsers7d = 0;
  let newUsers30d = 0;

  for (const p of profiles) {
    planCounts[p.plan] = (planCounts[p.plan] ?? 0) + 1;
    const age = now.getTime() - new Date(p.created_at).getTime();
    if (age < 7  * 24 * 3600 * 1000) newUsers7d++;
    if (age < 30 * 24 * 3600 * 1000) newUsers30d++;
  }

  const paidUsers = (planCounts.starter ?? 0) + (planCounts.creator ?? 0) + (planCounts.studio ?? 0);
  const totalUsers = profiles.length;

  // MRR estimate
  const mrrAud =
    (planCounts.starter ?? 0) * (PLAN_PRICES_AUD.starter ?? 19) +
    (planCounts.creator ?? 0) * (PLAN_PRICES_AUD.creator ?? 39) +
    (planCounts.studio  ?? 0) * (PLAN_PRICES_AUD.studio  ?? 99);

  // ARR = MRR × 12
  const arrAud = mrrAud * 12;

  // ── Pack revenue ──────────────────────────────────────────────────────────
  const packs = (creditPacksResult.data ?? []) as { credits: number; amount_cents: number | null; created_at: string }[];
  const packRevenueCents = packs.reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);
  const packRevenueAud   = packRevenueCents / 100;
  const totalPackCredits = packs.reduce((sum, p) => sum + p.credits, 0);

  // ── Generation stats ──────────────────────────────────────────────────────
  const genRows = (generationHistoryResult.data ?? []) as {
    provider: string;
    generation_ms: number | null;
    credits_spent: number | null;
    status: string;
  }[];

  const providerBreakdown: Record<string, { count: number; totalMs: number; totalCredits: number }> = {};
  let totalCreditsConsumed = 0;
  let totalGenMs = 0;

  for (const g of genRows) {
    const p = g.provider;
    if (!providerBreakdown[p]) providerBreakdown[p] = { count: 0, totalMs: 0, totalCredits: 0 };
    providerBreakdown[p].count++;
    providerBreakdown[p].totalMs += g.generation_ms ?? 0;
    providerBreakdown[p].totalCredits += g.credits_spent ?? 0;
    totalCreditsConsumed += g.credits_spent ?? 0;
    totalGenMs += g.generation_ms ?? 0;
  }

  const providerStats = Object.entries(providerBreakdown).map(([provider, s]) => ({
    provider,
    count:          s.count,
    avg_ms:         s.count > 0 ? Math.round(s.totalMs / s.count) : 0,
    avg_credits:    s.count > 0 ? Math.round(s.totalCredits / s.count) : 0,
    total_credits:  s.totalCredits,
  })).sort((a, b) => b.count - a.count);

  const avgCreditsPerVideo = genRows.length > 0 ? Math.round(totalCreditsConsumed / genRows.length) : 0;
  const avgGenMs = genRows.length > 0 ? Math.round(totalGenMs / genRows.length) : 0;

  // Estimated API cost (rough: 1 credit ≈ A$0.05 in API costs)
  const CREDIT_TO_AUD_COST = 0.05;
  const estimatedApiCostAud = totalCreditsConsumed * CREDIT_TO_AUD_COST;
  const estimatedProfitAud  = mrrAud + packRevenueAud - estimatedApiCostAud;

  // ── Top users by credits spent ────────────────────────────────────────────
  const reservations = (topUsersResult.data ?? []) as { user_id: string; credits: number }[];
  const userSpend: Record<string, number> = {};
  for (const r of reservations) {
    userSpend[r.user_id] = (userSpend[r.user_id] ?? 0) + r.credits;
  }
  const topUsers = Object.entries(userSpend)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([userId, credits]) => ({ userId: userId.slice(0, 8), credits }));

  // ── Credit transaction breakdown ──────────────────────────────────────────
  const txns = (creditTransResult.data ?? []) as { amount: number; type: string; created_at: string }[];
  const txnByType: Record<string, { count: number; totalAmount: number }> = {};
  for (const t of txns) {
    if (!txnByType[t.type]) txnByType[t.type] = { count: 0, totalAmount: 0 };
    txnByType[t.type].count++;
    txnByType[t.type].totalAmount += Math.abs(t.amount);
  }

  // ── Recent renders activity ───────────────────────────────────────────────
  const recentRenders = (recentRendersResult.data ?? []).map(r => ({
    id:           (r.id as string).slice(0, 8),
    userId:       (r.user_id as string | null)?.slice(0, 8) ?? "—",
    template:     r.template ?? "—",
    hasVideo:     !!r.video_url,
    completedAt:  r.completed_at,
  }));

  return Response.json({
    // Revenue
    mrr_aud:               mrrAud,
    arr_aud:               arrAud,
    pack_revenue_aud:      packRevenueAud,
    estimated_api_cost_aud: estimatedApiCostAud,
    estimated_profit_aud:  estimatedProfitAud,
    total_pack_credits:    totalPackCredits,

    // Users
    total_users:   totalUsers,
    paid_users:    paidUsers,
    new_users_7d:  newUsers7d,
    new_users_30d: newUsers30d,
    plan_counts:   planCounts,

    // Generations (last 30d)
    total_videos_alltime:    rendersResult.count ?? 0,
    total_videos_30d:        renders30dResult.count ?? 0,
    total_generations_30d:   genRows.length,
    avg_credits_per_video:   avgCreditsPerVideo,
    avg_generation_ms:       avgGenMs,
    total_credits_consumed:  totalCreditsConsumed,
    provider_breakdown:      providerStats,

    // Activity
    top_users:        topUsers,
    recent_renders:   recentRenders,
    txn_by_type:      Object.entries(txnByType).map(([type, s]) => ({ type, ...s })),

    generated_at: now.toISOString(),
  });
}
