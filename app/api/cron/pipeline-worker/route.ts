/* GET /api/cron/pipeline-worker
 *
 * Crash recovery for orphaned pipeline jobs.
 *
 * If the original `after()` invocation died mid-pipeline (function
 * timeout, crash, OOM), some `render_pipeline_jobs` rows will sit in
 * status='running' with a stale `locked_at`. This worker picks them up
 * and re-runs the pipeline. The pipeline is fully idempotent — each
 * stage short-circuits if its output already exists — so resumption
 * picks up exactly where the previous run died.
 *
 * Schedule: every 5 minutes via Vercel Cron. Concurrent ticks are
 * safe because openJob takes an optimistic lock; only one worker can
 * own a given job at a time.
 */

import { findOrphanJobs } from "../../../../lib/pipeline/jobs";
import { runPipeline } from "../../../../lib/render-engine";
import { supabaseAdmin } from "../../../../lib/supabase/admin";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

interface RenderRow {
  id: string;
  user_id: string;
  status: string;
  script: string | null;
  scenes: unknown;
  voice_id: string | null;
  brief: { duration?: number } | null;
  credits_used: number | null;
  template: string | null;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const orphans = await findOrphanJobs(20);
  const processed: Array<{ render_id: string; step: string; result: string }> = [];

  // Group by render_id — one resumption per render covers all steps.
  const seen = new Set<string>();
  for (const job of orphans) {
    if (seen.has(job.render_id)) continue;
    seen.add(job.render_id);

    const { data: render } = await supabaseAdmin
      .from("renders")
      .select("id, user_id, status, script, scenes, voice_id, brief, credits_used, template")
      .eq("id", job.render_id)
      .maybeSingle();

    const r = render as RenderRow | null;
    if (!r) {
      processed.push({ render_id: job.render_id, step: job.step, result: "render_missing" });
      continue;
    }
    if (r.status === "complete" || r.status === "failed") {
      processed.push({ render_id: job.render_id, step: job.step, result: "already_terminal" });
      continue;
    }
    if (!r.script || !Array.isArray(r.scenes) || r.scenes.length === 0) {
      processed.push({ render_id: job.render_id, step: job.step, result: "missing_inputs" });
      continue;
    }

    const voiceId = r.voice_id || process.env.DEFAULT_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
    const credits = Number(r.credits_used ?? 0) || 0;

    // Fire and forget — runPipeline emits its own events + closes jobs.
    void runPipeline({
      renderId: r.id,
      userId: r.user_id,
      script: r.script,
      scenes: r.scenes as Parameters<typeof runPipeline>[0]["scenes"],
      voiceId,
      creditsRequired: credits,
    });
    processed.push({ render_id: job.render_id, step: job.step, result: "resumed" });
  }

  return Response.json({
    ok: true,
    orphans_found: orphans.length,
    renders_resumed: processed.filter((p) => p.result === "resumed").length,
    processed,
  });
}
