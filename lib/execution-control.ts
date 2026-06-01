/**
 * Execution control — reads recent pipeline health and returns an execution
 * mode that caps scene count under system stress.
 *
 * Three modes:
 *   stable     — failure rate > 30% last 2h → maxScenes=3
 *   balanced   — failure rate 10–30%        → maxScenes=5
 *   aggressive — failure rate < 10%         → maxScenes=8 (default)
 *
 * The mode is computed once per job before Director Core planning and has
 * zero effect on pipeline execution order or provider selection.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

export type ExecutionMode = "stable" | "balanced" | "aggressive";

export interface ExecutionPlan {
  mode:      ExecutionMode;
  maxScenes: number;
  reason:    string;
}

const MODE_SCENE_CAPS: Record<ExecutionMode, number> = {
  stable:     3,
  balanced:   5,
  aggressive: 8,
};

export async function getExecutionPlan(): Promise<ExecutionPlan> {
  try {
    const windowStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data } = await supabaseAdmin
      .from("avatar_stage_ledger")
      .select("status")
      .gte("created_at", windowStart);

    const rows   = data ?? [];
    const total  = rows.length;

    if (total < 5) {
      // Not enough signal — default to aggressive
      return { mode: "aggressive", maxScenes: 8, reason: "insufficient_history" };
    }

    const failed  = rows.filter(r => r.status === "failed").length;
    const rate    = failed / total;

    if (rate > 0.3) {
      return { mode: "stable",     maxScenes: MODE_SCENE_CAPS.stable,     reason: `failure_rate=${Math.round(rate * 100)}%` };
    }
    if (rate > 0.1) {
      return { mode: "balanced",   maxScenes: MODE_SCENE_CAPS.balanced,   reason: `failure_rate=${Math.round(rate * 100)}%` };
    }
    return       { mode: "aggressive", maxScenes: MODE_SCENE_CAPS.aggressive, reason: `failure_rate=${Math.round(rate * 100)}%` };
  } catch {
    // Never block job execution on a health-check failure
    return { mode: "aggressive", maxScenes: 8, reason: "health_check_error" };
  }
}
