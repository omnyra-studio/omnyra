/* Churn detection.
 *
 * Computes a churn-risk score per user from event history. A user is
 * HIGH risk (score >= 70) when one or more of these are true:
 *   - no `render_completed` event in the last 72h after first activity
 *   - >= 3 `render_failed` events in the last 7d
 *   - average completion_rate on recent video_completed events < 0.2
 *
 * Risk score is a weighted sum, capped 0..100. Higher = more urgent.
 */

import { supabaseAdmin } from "../supabase/admin";

const HOUR = 60 * 60 * 1000;
const STALE_HOURS = 72;
const FAILURE_WINDOW_HOURS = 24 * 7;
const FAILURE_THRESHOLD = 3;
const LOW_COMPLETION_THRESHOLD = 0.2;

export interface UserChurnSignal {
  user_id: string;
  risk_score: number;
  reasons: string[];
}

export async function computeChurnSignals(limit: number = 500): Promise<UserChurnSignal[]> {
  // Pull all users active in the last 30 days. Inactive-forever users
  // are out of scope for retention interventions.
  const since30d = new Date(Date.now() - 30 * 24 * HOUR).toISOString();

  const { data: activeUserRows } = await supabaseAdmin
    .from("events")
    .select("user_id")
    .gte("created_at", since30d)
    .not("user_id", "is", null)
    .limit(10000);

  const userIds = Array.from(
    new Set((activeUserRows ?? []).map((r) => r.user_id).filter(Boolean) as string[]),
  ).slice(0, limit);

  if (userIds.length === 0) return [];

  // Batch-fetch per-user signals in parallel. For 100s of users this
  // is fine; if user count grows past ~2k, replace with a single
  // window-function query in a Postgres function.
  const signals = await Promise.all(
    userIds.map(async (user_id) => {
      const reasons: string[] = [];
      let score = 0;

      // 1. Recency of completed render
      const { data: lastComplete } = await supabaseAdmin
        .from("events")
        .select("created_at")
        .eq("user_id", user_id)
        .eq("type", "render_completed")
        .order("created_at", { ascending: false })
        .limit(1);

      const lastCompleteAt = lastComplete && lastComplete[0]
        ? new Date(lastComplete[0].created_at).getTime()
        : 0;
      const hoursSinceLastComplete = lastCompleteAt
        ? (Date.now() - lastCompleteAt) / HOUR
        : Infinity;

      if (hoursSinceLastComplete > STALE_HOURS) {
        reasons.push(`stale_${Math.round(hoursSinceLastComplete)}h`);
        // Linearly ramp from 0 (at 72h) to 40 (at 1 week).
        score += Math.min(40, Math.round(((hoursSinceLastComplete - STALE_HOURS) / 96) * 40));
      }

      // 2. Recent failure count
      const sinceFailWindow = new Date(Date.now() - FAILURE_WINDOW_HOURS * HOUR).toISOString();
      const { count: failures } = await supabaseAdmin
        .from("events")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user_id)
        .eq("type", "render_failed")
        .gte("created_at", sinceFailWindow);

      if ((failures ?? 0) >= FAILURE_THRESHOLD) {
        reasons.push(`failures_${failures}`);
        score += Math.min(30, (failures ?? 0) * 10);
      }

      // 3. Low completion rate on viewed videos
      const { data: completions } = await supabaseAdmin
        .from("events")
        .select("payload")
        .eq("user_id", user_id)
        .eq("type", "video_completed")
        .order("created_at", { ascending: false })
        .limit(10);

      if (completions && completions.length > 0) {
        const rates = completions
          .map((r) => Number((r.payload as { completion_rate?: number } | null)?.completion_rate))
          .filter(Number.isFinite);
        if (rates.length > 0) {
          const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
          if (avg < LOW_COMPLETION_THRESHOLD) {
            reasons.push(`low_completion_${avg.toFixed(2)}`);
            score += 20;
          }
        }
      }

      return { user_id, risk_score: Math.min(100, score), reasons };
    }),
  );

  return signals.filter((s) => s.risk_score > 0).sort((a, b) => b.risk_score - a.risk_score);
}

/**
 * Persist churn signals into user_profiles_extended.
 *
 * Side-effect: for HIGH risk users (score >= 70), set
 * `suggested_template = 'faceless'` (lowest-friction format per spec
 * §7). This is a SAFE intervention — it does not deduct credits, does
 * not modify billing, and is fully reversible (the next cron run will
 * clear it when risk drops). The /api/create/defaults endpoint reads
 * this column to pre-select the friendlier template.
 *
 * Idempotent upsert.
 */
const HIGH_RISK_THRESHOLD = 70;
const EASIER_TEMPLATE = "faceless";

export async function persistChurnSignals(signals: UserChurnSignal[]): Promise<void> {
  for (const s of signals) {
    const highRisk = s.risk_score >= HIGH_RISK_THRESHOLD;
    const patch: Record<string, unknown> = {
      user_id: s.user_id,
      churn_risk_score: s.risk_score,
      recomputed_at: new Date().toISOString(),
      // AGS §7 — when a user is at risk, prefer the friendliest
      // template and skip optional onboarding. Both flags lift when
      // risk drops (reversible).
      suggested_template: highRisk ? EASIER_TEMPLATE : null,
      onboarding_minimal: highRisk,
    };
    await supabaseAdmin
      .from("user_profiles_extended")
      .upsert(patch, { onConflict: "user_id" });
  }
}
