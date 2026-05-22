/* Batch scoring orchestrator.
 *
 * Calls the PL/pgSQL recalculators in supabase/migrations/
 * recalculate_scores_schema.sql:
 *
 *   recalculate_content_scores(p_window_days)  → content_scores rows touched
 *   recalculate_template_scores(p_window_days) → template_scores rows touched
 *   recalculate_user_scores(p_window_days)     → user_scores rows touched
 *
 * Pushing the aggregation down into SQL keeps it transactional, fast,
 * and idempotent (every function UPSERTs only). The cron route is a
 * thin wrapper around these calls.
 *
 * SPEC GUARANTEE:
 *   - NEVER call any of these from inside an API request that serves
 *     user traffic. Scoring is batch-only.
 *   - Re-running is safe; each function UPSERTs and never duplicates.
 */

import { supabaseAdmin } from "../supabase/admin";

export interface ScoringResult {
  content_scores_touched: number;
  template_scores_touched: number;
  user_scores_touched: number;
  duration_ms: number;
  errors: string[];
}

export async function runBatchScoring(windowDays: number = 30): Promise<ScoringResult> {
  const started = Date.now();
  const errors: string[] = [];

  async function callRpc(fn: string): Promise<number> {
    const { data, error } = await supabaseAdmin.rpc(fn, { p_window_days: windowDays });
    if (error) {
      errors.push(`${fn}: ${error.message}`);
      return 0;
    }
    return Number(data ?? 0);
  }

  const [content, templates, users] = await Promise.all([
    callRpc("recalculate_content_scores"),
    callRpc("recalculate_template_scores"),
    callRpc("recalculate_user_scores"),
  ]);

  return {
    content_scores_touched: content,
    template_scores_touched: templates,
    user_scores_touched: users,
    duration_ms: Date.now() - started,
    errors,
  };
}
