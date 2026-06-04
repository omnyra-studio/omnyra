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

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Find all jobs in lipsync stage that the worker handed off (lock released after submit)
  const { data: rawJobs } = await supabaseAdmin
    .from("avatar_jobs")
    .select("*")
    .eq("status", "processing")
    .is("locked_by", null)
    .eq("stage", "lipsync")
    .limit(20);

  const jobs = ((rawJobs ?? []) as AvatarJob[]).filter(
    (j) => !!(j.stage_outputs as Record<string, string>)?.hedra_generation_id,
  );

  if (!jobs.length) {
    return Response.json({ processed: 0, message: "no pending hedra jobs" });
  }

  let completed = 0;
  let failed    = 0;
  let pending   = 0;

  for (const job of jobs) {
    const outputs  = job.stage_outputs as Record<string, string>;
    const genId    = outputs.hedra_generation_id;
    const reqHash  = outputs.hedra_req_hash ?? "";
    const log      = (msg: string) => console.log(`[hedra-cron] [${job.id}] ${msg}`);

    try {
      const result = await checkHedraGenerationStatus(genId);
      log(`status=${result.status}`);

      if (result.status === "complete" && result.videoUrl) {
        // 1. Download ephemeral S3 video before it expires
        log(`[HEDRA_DONE] downloading video url_len=${result.videoUrl.length}`);
        const videoRes = await fetch(result.videoUrl, { signal: AbortSignal.timeout(120_000) });
        if (!videoRes.ok) throw new Error(`video download HTTP ${videoRes.status}`);
        const videoBuffer = await videoRes.arrayBuffer();

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

        // 4. Complete the job record
        await completeJobFromCron(job.id, permanentUrl, permanentUrl);
        log(`[JOB_COMPLETED] result_url=${permanentUrl.substring(0, 80)}`);

        // 5. Insert into renders table so the video appears in My Videos
        await supabaseAdmin.from("renders").insert({
          user_id:      job.user_id,
          status:       "completed",
          script:       job.input.script,
          video_url:    permanentUrl,
          audio_url:    outputs.audio_url ?? null,
          template:     "avatar",
          completed_at: new Date().toISOString(),
        });
        log(`[VIDEO_SAVED] user_id=${job.user_id}`);

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
        log(`[HEDRA_ERROR] ${errMsg}`);
        await failJobFromCron(job.id, errMsg);
        failed++;
      } else {
        // processing | queued | finalizing | unknown — retry on next cron tick
        log(`[HEDRA_PENDING] status=${result.status}`);
        pending++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`[CRON_ERROR] ${msg}`);
      // Transient error — do not fail the job; next cron will retry
    }
  }

  console.log(`[hedra-cron] done completed=${completed} failed=${failed} pending=${pending} total=${jobs.length}`);
  return Response.json({ processed: jobs.length, completed, failed, pending });
}
