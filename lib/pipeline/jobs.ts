/* Pipeline job tracking.
 *
 * Each stage in runPipeline opens a `render_pipeline_jobs` row, sets
 * status='running', then closes it as completed/failed/skipped. This
 * gives us:
 *   - per-stage timing + provider attribution
 *   - crash recovery (cron picks up "running" jobs whose lock is stale)
 *   - bottleneck detection via the timings view
 *
 * Spec rule: nothing here runs in a user-facing request path. Jobs are
 * the bookkeeping of an already-background pipeline.
 */

import { supabaseAdmin } from "../supabase/admin";

export type PipelineStep =
  | "generate_script"
  | "generate_voice"
  | "generate_video"
  | "generate_lipsync"
  | "attach_voiceover"
  | "finalise_render";

const STALE_LOCK_MS = 5 * 60 * 1000;

export interface OpenJobInput {
  render_id: string;
  user_id: string;
  step: PipelineStep;
  provider?: string;
  context?: Record<string, unknown>;
  worker?: string;
}

/** Open a job row in 'running' state. Returns the job id. If a row for
 * the same (render_id, step) already exists in 'running' or 'completed',
 * we surface it via the `existing` flag so the caller can skip duplicate
 * work — preserves idempotency. */
export async function openJob(input: OpenJobInput): Promise<{ id: string; existing: "running" | "completed" | null }> {
  // Check for a completed row first — short-circuits a re-run.
  const { data: prior } = await supabaseAdmin
    .from("render_pipeline_jobs")
    .select("id, status")
    .eq("render_id", input.render_id)
    .eq("step", input.step)
    .in("status", ["completed", "running"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (prior && prior[0]) {
    if (prior[0].status === "completed") {
      return { id: prior[0].id, existing: "completed" };
    }
    // Running. Check if the lock is stale; if so, take it over.
    const { data: row } = await supabaseAdmin
      .from("render_pipeline_jobs")
      .select("locked_at")
      .eq("id", prior[0].id)
      .single();
    const lockAge = row?.locked_at ? Date.now() - new Date(row.locked_at).getTime() : Infinity;
    if (lockAge < STALE_LOCK_MS) {
      return { id: prior[0].id, existing: "running" };
    }
    // Stale — reclaim the lock by updating.
    await supabaseAdmin
      .from("render_pipeline_jobs")
      .update({
        attempt: 1,
        locked_at: new Date().toISOString(),
        locked_by: input.worker ?? "after",
        started_at: new Date().toISOString(),
        status: "running",
        error_message: null,
      })
      .eq("id", prior[0].id);
    return { id: prior[0].id, existing: null };
  }

  const { data: ins, error } = await supabaseAdmin
    .from("render_pipeline_jobs")
    .insert({
      render_id: input.render_id,
      user_id: input.user_id,
      step: input.step,
      provider: input.provider ?? null,
      context: input.context ?? {},
      status: "running",
      started_at: new Date().toISOString(),
      locked_at: new Date().toISOString(),
      locked_by: input.worker ?? "after",
    })
    .select("id")
    .single();
  if (error || !ins) {
    console.error("[pipeline/jobs] openJob insert failed:", error?.message);
    return { id: "", existing: null };
  }
  return { id: ins.id, existing: null };
}

export async function completeJob(
  id: string,
  output: Record<string, unknown> = {},
): Promise<void> {
  await supabaseAdmin
    .from("render_pipeline_jobs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      context: output,
      locked_at: null,
    })
    .eq("id", id);
}

export async function skipJob(id: string, reason: string): Promise<void> {
  await supabaseAdmin
    .from("render_pipeline_jobs")
    .update({
      status: "skipped",
      completed_at: new Date().toISOString(),
      context: { skipped_reason: reason },
      locked_at: null,
    })
    .eq("id", id);
}

export async function failJob(id: string, error: string): Promise<void> {
  await supabaseAdmin
    .from("render_pipeline_jobs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: error,
      locked_at: null,
    })
    .eq("id", id);
}

/** Return jobs that look orphaned: status='running' with a stale lock,
 * or pending for more than the threshold. */
export async function findOrphanJobs(limit: number = 50): Promise<Array<{
  id: string;
  render_id: string;
  user_id: string;
  step: PipelineStep;
}>> {
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS).toISOString();
  const { data } = await supabaseAdmin
    .from("render_pipeline_jobs")
    .select("id, render_id, user_id, step, locked_at, status")
    .in("status", ["running", "pending"])
    .or(`locked_at.is.null,locked_at.lt.${staleBefore}`)
    .order("created_at", { ascending: true })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    render_id: r.render_id as string,
    user_id: r.user_id as string,
    step: r.step as PipelineStep,
  }));
}
