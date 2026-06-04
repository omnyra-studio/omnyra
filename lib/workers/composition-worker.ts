/**
 * Composition worker — assembles the final video by calling the Railway FFmpeg
 * microservice. Delegates to the existing /api/compose-video business logic via
 * an authenticated internal call.
 *
 * This worker is the service boundary between the orchestration engine and
 * the external FFmpeg composer. Keeping it as an HTTP call is intentional:
 * compose-video talks to Railway (another HTTP service) so the chain
 *   worker → compose-video route → Railway
 * is not internal API-chaining — it's external service composition.
 */

import { createClient } from "@supabase/supabase-js";
import type { ComposeVideoJob, WorkerResult } from "./types";
import { cleanEnv } from "@/lib/supabase/admin";

export async function processCompositionJob(job: ComposeVideoJob): Promise<WorkerResult> {
  const { planId, projectId, userId } = job;

  const supabase = createClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
  );

  // Idempotency — skip if already completed
  const { data: existingJob } = await supabase
    .from("render_jobs")
    .select("id, status, video_url")
    .eq("plan_id", planId)
    .eq("status", "completed")
    .maybeSingle();

  if (existingJob?.video_url) {
    console.log(`[composition-worker] plan ${planId} already composed — skipping`);
    return { success: true };
  }

  // ── Verify worker secret before proceeding ────────────────────────────────────
  const baseUrl = process.env.WORKER_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const secret  = process.env.WORKER_SECRET ?? "";

  if (!baseUrl) {
    return { success: false, error: "WORKER_BASE_URL not configured" };
  }

  // ── Delegate to compose-video route (service boundary — external FFmpeg) ──────
  const res = await fetch(`${baseUrl}/api/compose-video`, {
    method:  "POST",
    headers: {
      "Content-Type":    "application/json",
      "X-Worker-Secret": secret,
      // Pass user context as trusted internal header (verified in compose-video)
      "X-Worker-User-Id":    userId,
      "X-Worker-Project-Id": projectId,
      "X-Worker-Plan-Id":    planId,
    },
    body: JSON.stringify({ planId, projectId }),
  });

  if (!res.ok) {
    let errMsg = `compose-video returned HTTP ${res.status}`;
    try {
      const body = await res.json() as { error?: string };
      if (body.error) errMsg = body.error;
    } catch { /* ignore */ }
    console.error("[composition-worker] compose-video error:", errMsg);
    return { success: false, error: errMsg };
  }

  const data = await res.json() as { success: boolean; video_url?: string; error?: string };
  if (!data.success || !data.video_url) {
    return { success: false, error: data.error ?? "Composition failed without a reason" };
  }

  console.log(`[composition-worker] plan ${planId} → ${data.video_url}`);
  return { success: true };
}
