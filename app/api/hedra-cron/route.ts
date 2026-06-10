/**
 * GET /api/hedra-cron  (Vercel Cron — runs every minute)
 *
 * Polls all avatar jobs that were handed off to Hedra via fire-and-forget submit.
 * Identified by: status=processing, locked_by IS NULL, stage=lipsync,
 * and stage_outputs.hedra_generation_id present.
 *
 * On complete:
 *   download S3 video → rehost to Supabase renders bucket → mark cost charged
 *   → reconcile ledger → complete job → insert renders row (My Videos)
 *
 * On error:
 *   fail the job so the user sees an error state
 *
 * Auth: Vercel sends `authorization: Bearer ${CRON_SECRET}`
 */

import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  type AvatarJob,
  completeJobFromCron,
  failJobFromCron,
  markCostCharged,
  reconcileStageFromCost,
} from "@/lib/avatar-queue";
import { checkHedraGenerationStatus } from "@/lib/providers/hedra";
import { loadCharacter, updateCharacterRefFrame } from "@/lib/character-registry";
import { cachePrompt } from "@/lib/prompt-memory-cache";
import type { SceneSpec } from "@/lib/avatar-scene-planner";

export const maxDuration = 60;

// Per-job timeout budget — leave 10s for post-processing + response
const JOB_TIMEOUT_MS = 40_000;
// Cron wall-clock deadline — bail before Vercel/Cloudflare cuts us at ~55s
const CRON_DEADLINE_MS = 50_000;

export async function GET(req: NextRequest) {
  const cronT0  = Date.now();
  const invoked = new Date().toISOString();
  console.log(`[hedra-cron] [CRON_INVOKED] at=${invoked}`);

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      console.log(`[hedra-cron] [CRON_AUTH_FAIL] expected Bearer token`);
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Shorter query: limit 5 per tick (process fast, stay under deadline)
  const { data: rawJobs, error: queryErr } = await supabaseAdmin
    .from("avatar_jobs")
    .select("id, user_id, status, stage, stage_outputs, input, retry_count, retry_count_per_stage")
    .eq("status", "processing")
    .is("locked_by", null)
    .eq("stage", "lipsync")
    .limit(5);

  if (queryErr) {
    console.log(`[hedra-cron] [CRON_QUERY_ERROR] ${queryErr.message}`);
    return Response.json({ error: queryErr.message }, { status: 500 });
  }

  const jobs = ((rawJobs ?? []) as AvatarJob[]).filter(
    (j) => !!(j.stage_outputs as Record<string, string>)?.hedra_generation_id,
  );

  console.log(`[hedra-cron] [CRON_START] raw_rows=${rawJobs?.length ?? 0} with_gen_id=${jobs.length}`);

  if (!jobs.length) {
    return Response.json({ processed: 0, message: "no pending hedra jobs" });
  }

  let completed = 0;
  let failed    = 0;
  let pending   = 0;

  // Process jobs in parallel — each with an individual AbortSignal timeout
  await Promise.all(jobs.map(async (job) => {
    // Bail early if we're approaching the cron wall-clock deadline
    if (Date.now() - cronT0 > CRON_DEADLINE_MS) {
      console.log(`[hedra-cron] [${job.id.slice(0, 8)}] DEADLINE_SKIP — bailing to stay under ${CRON_DEADLINE_MS}ms`);
      pending++;
      return;
    }

    const outputs  = job.stage_outputs as Record<string, string>;
    const genId    = outputs.hedra_generation_id;
    const reqHash  = outputs.hedra_req_hash ?? "";
    const log      = (msg: string) => console.log(`[hedra-cron] [${job.id.slice(0, 8)}] ${msg}`);

    log(`[CRON_JOB] generation_id=${genId} submitted_at=${outputs.hedra_submitted_at ?? "unknown"}`);

    let result: { status: string; videoUrl?: string; errorMessage?: string };
    try {
      // Hard timeout on status check — prevents 522s from slow Hedra responses
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), JOB_TIMEOUT_MS);
      result = await checkHedraGenerationStatus(genId).finally(() => clearTimeout(timer));
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      const isTimeout = msg.includes("aborted") || msg.includes("timeout") || msg.includes("ETIMEDOUT");
      log(`[CRON_STATUS_ERROR] ${isTimeout ? "TIMEOUT" : "FETCH_ERROR"} — ${msg} — will retry next tick`);
      pending++;
      return; // non-fatal: leave job in processing, next cron tick retries
    }
    log(`[CRON_JOB] status=${result.status} has_url=${!!result.videoUrl}`);

    try {
      if (result.status === "complete" && result.videoUrl) {
        // 1. Download ephemeral S3 video before it expires
        log(`[HEDRA_DONE] downloading video url_len=${result.videoUrl.length}`);
        const videoRes = await fetch(result.videoUrl, { signal: AbortSignal.timeout(120_000) });
        if (!videoRes.ok) throw new Error(`video download HTTP ${videoRes.status}`);
        const videoBuffer = await videoRes.arrayBuffer();
        log(`[DOWNLOAD_OK] bytes=${videoBuffer.byteLength}`);

        // 2. Re-host in Supabase renders bucket (permanent URL)
        const rehostedPath = `${job.id}/final/avatar-video.mp4`;
        const { error: upErr } = await supabaseAdmin.storage
          .from("renders")
          .upload(rehostedPath, videoBuffer, { contentType: "video/mp4", upsert: true });
        if (upErr) throw new Error(`rehost upload: ${upErr.message}`);

        const { data: { publicUrl: permanentUrl } } = supabaseAdmin.storage
          .from("renders")
          .getPublicUrl(rehostedPath);
        log(`[HEDRA_REHOSTED] url=${permanentUrl.substring(0, 80)}`);

        // 3. Mark cost charged + reconcile execution ledger
        if (reqHash) await markCostCharged(job.id, "lipsync", reqHash, permanentUrl);
        await reconcileStageFromCost(job.id, "lipsync", permanentUrl);

        // 4. Atomically complete the job — exactly one concurrent cron tick wins.
        // completeJobFromCron uses .eq("status","processing") + .maybeSingle() as the
        // predicate; whichever tick updates the row first gets completed=true; others false.
        const { completed: jobCompleted } = await completeJobFromCron(job.id, permanentUrl, permanentUrl);
        log(`[CRON_COMPLETE] job_id=${job.id} won_race=${jobCompleted}`);

        if (!jobCompleted) {
          log(`[RACE_LOST] another cron tick already completed this job — skipping renders insert`);
          completed++;
          return;
        }

        // 5. Insert into renders table so the video appears in My Videos.
        // IMPORTANT: renders.status CHECK constraint = ('queued','drafting','rendering','complete','failed')
        // Must use "complete" not "completed".
        // Only reached when we won the race above — no duplicate rows possible.
        const { error: renderErr } = await supabaseAdmin.from("renders").insert({
          user_id:      job.user_id,
          status:       "complete",      // DB CHECK constraint — NOT "completed"
          script:       job.input.script,
          video_url:    permanentUrl,
          audio_url:    outputs.audio_url ?? null,
          template:     "avatar",
          completed_at: new Date().toISOString(),
        });

        if (renderErr) {
          // Surface the error — this is why My Videos may be empty
          log(`[CRON_RENDERS_INSERT] ERROR code=${renderErr.code} msg=${renderErr.message}`);
          // Don't throw — job is completed, video is accessible via result_url.
          // A repair pass can re-insert the renders row from completed avatar_jobs.
        } else {
          log(`[CRON_RENDERS_INSERT] success user_id=${job.user_id}`);
          log(`[VIDEO_SAVED] user_id=${job.user_id} video_url=${permanentUrl.substring(0, 80)}`);
        }

        // 6. Side effects — character ref_frame + prompt cache (non-fatal)
        void (async () => {
          try {
            if (job.input.character_id) {
              const char = await loadCharacter(job.input.character_id);
              if (char) {
                await updateCharacterRefFrame(job.input.character_id, permanentUrl);
                log(`[CHARACTER] updated ref_frame character_id=${job.input.character_id}`);
              }
            }

            if (!job.input.character_id) {
              const specsJson = outputs.scene_specs;
              if (specsJson) {
                const specs = JSON.parse(specsJson) as SceneSpec[];
                await Promise.all(
                  specs.map(s => cachePrompt(job.user_id, s.shotType, s.emotion, s.visualPrompt, 1.0)),
                );
                log(`[CACHE] populated ${specs.length} prompt(s)`);
              }
            }
          } catch (sideErr) {
            log(`[SIDE_EFFECT_ERROR] ${(sideErr as Error).message}`);
          }
        })();

        completed++;
      } else if (result.status === "error") {
        const errMsg = result.errorMessage ?? "Hedra generation failed";
        log(`[CRON_JOB] HEDRA_ERROR: ${errMsg}`);
        await failJobFromCron(job.id, errMsg);
        failed++;
      } else {
        // processing | queued | finalizing | unknown — retry on next cron tick
        log(`[CRON_JOB] HEDRA_PENDING status=${result.status}`);
        pending++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`[CRON_ERROR] job_id=${job.id} error=${msg}`);
      // Transient error — do not fail the job; next cron will retry
    }
  }));

  console.log(`[hedra-cron] [CRON_DONE] completed=${completed} failed=${failed} pending=${pending} total=${jobs.length}`);
  return Response.json({ processed: jobs.length, completed, failed, pending });
}
