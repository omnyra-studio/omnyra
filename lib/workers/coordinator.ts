/**
 * Orchestration coordinator — checks whether all pipeline preconditions are met
 * and enqueues the composition job when they are.
 *
 * Called by both shot-worker and voiceover-worker after each completion.
 * Safe to call multiple times concurrently — the composition job is idempotent
 * (compose-video upserts the render_job row).
 */

import { emitAndForget } from "@/lib/events/emitter";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export async function checkAndEnqueueComposition(
  supabase: AnyClient,
  planId:   string,
  userId:   string,
): Promise<void> {
  // ── Check all shots are completed (no pending or queued) ─────────────────────
  const { count: pendingCount } = await supabase
    .from("shots")
    .select("id", { count: "exact", head: true })
    .eq("shot_plan_id", planId)
    .in("render_status", ["pending", "queued", "rendering"]);

  if (pendingCount && pendingCount > 0) return;

  // ── Check there's at least one completed shot ─────────────────────────────────
  const { count: doneCount } = await supabase
    .from("shots")
    .select("id", { count: "exact", head: true })
    .eq("shot_plan_id", planId)
    .eq("render_status", "completed");

  if (!doneCount || doneCount === 0) return;

  // ── Check voiceover is ready ─────────────────────────────────────────────────
  const { data: plan } = await supabase
    .from("shot_plans")
    .select("voiceover_url, project_id")
    .eq("id", planId)
    .single();

  if (!plan?.voiceover_url) return;

  // ── Guard: don't re-enqueue if composition already in flight ─────────────────
  const { data: existingJob } = await supabase
    .from("render_jobs")
    .select("id, status")
    .eq("plan_id", planId)
    .in("status", ["assembling", "completed"])
    .maybeSingle();

  if (existingJob) return;

  // ── All conditions met — enqueue composition ──────────────────────────────────
  console.log(`[coordinator] plan ${planId} — all shots + voiceover ready → enqueueing composition`);

  emitAndForget({
    type:          "COMPOSITION_STARTED",
    correlationId: planId,
    payload:       { planId, projectId: plan.project_id as string },
  });

  const { getQueue } = await import("./queue");
  await getQueue().enqueue({
    type:      "compose_video",
    planId,
    projectId: plan.project_id as string,
    userId,
  });
}
