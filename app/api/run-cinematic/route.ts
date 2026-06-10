/**
 * POST /api/run-cinematic  (internal background worker — never called by the browser directly)
 *
 * Validates x-internal-secret, reads a cinematic_jobs row, runs the full pipeline:
 *   1. Split script into scene prompts
 *   2. Generate Kling clips in parallel (3 × 10s = 30s video)
 *   3. Generate voiceover (ElevenLabs, 75-word trim)
 *   4. Stitch clips + merge audio
 *   5. Save to renders table
 *   6. Update cinematic_jobs.status = 'complete'
 *
 * Auth: x-internal-secret header must match CRON_SECRET env var.
 */

import { supabaseAdmin }         from "@/lib/supabase/admin";
import { generateKlingClip }     from "@/lib/orchestrator/kling-worker";
import { generateVoiceover }     from "@/lib/orchestrator/elevenlabs-worker";
import { stitchClips }           from "@/lib/orchestrator/clip-stitcher";
import { KLING_T2V_PRO, KLING_I2V_PRO } from "@/lib/video-models";
import { loadBrandMemory }       from "@/lib/memory/brand-memory";
import { loadCharacterMemory, buildKlingCharacterSuffix } from "@/lib/memory/character-memory";
import { generateGetImgFrame }   from "@/lib/orchestrator/getimg-worker";

export const maxDuration = 600;

const SCENE_COUNT    = 3;
const CLIP_DURATION  = 10;
const TARGET_SECS    = 30;
const MAX_SCRIPT_WORDS = 75;
const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaO";

function trimToWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return words.join(" ");
  return words.slice(0, max).join(" ").replace(/[,;]+$/, "") + ".";
}

async function setJobStatus(
  jobId:    string,
  status:   string,
  progress: number,
  extra:    Record<string, unknown> = {},
) {
  await supabaseAdmin
    .from("cinematic_jobs")
    .update({ status, progress, updated_at: new Date().toISOString(), ...extra })
    .eq("id", jobId);
}

export async function POST(req: Request) {
  const secret = req.headers.get("x-internal-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await req.json() as { jobId: string };
  if (!jobId) return Response.json({ error: "jobId required" }, { status: 400 });

  // Load job
  const { data: job, error: jobErr } = await supabaseAdmin
    .from("cinematic_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (jobErr || !job) {
    console.error(`[run-cinematic] job not found: ${jobId}`);
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  const userId    = job.user_id as string;
  const input     = job.input as Record<string, unknown>;
  const t0        = Date.now();
  const creditTxnId  = input.creditTxnId as string | undefined;
  const creditCost   = (input.creditCost as number | undefined) ?? 40;

  console.log(`[run-cinematic] START job=${jobId} user=${userId} txn=${creditTxnId ?? "none"}`);
  await setJobStatus(jobId, "running", 5);

  async function commitCredits(actualCost = creditCost) {
    if (!creditTxnId) return;
    try {
      await supabaseAdmin.rpc("credit_commit_atomic", { p_txn_id: creditTxnId, p_actual_cost: actualCost });
    } catch (e) {
      console.warn("[run-cinematic] credit commit failed:", (e as Error).message);
    }
  }
  async function rollbackCredits() {
    if (!creditTxnId) return;
    try {
      await supabaseAdmin.rpc("credit_rollback_atomic", { p_txn_id: creditTxnId });
    } catch (e) {
      console.warn("[run-cinematic] credit rollback failed:", (e as Error).message);
    }
  }

  try {
    // ── 1. Prepare script and scene prompts ──────────────────────────────────
    const rawScript    = (input.script  as string ?? "").trim();
    const goal         = (input.goal    as string ?? "").trim();
    const niche        = (input.niche   as string ?? "").trim();
    const voiceId      = (input.voiceId as string ?? DEFAULT_VOICE_ID);
    const characterId  = input.characterId as string | undefined;
    const speedMode    = (input.lightningMode ? "ultra-draft" : "draft") as string;

    const trimmedScript = trimToWords(rawScript || goal, MAX_SCRIPT_WORDS);
    console.log(`[run-cinematic] [DURATION_LOCK] scenes=${SCENE_COUNT} clip_sec=${CLIP_DURATION} target=${TARGET_SECS}s`);
    console.log(`[run-cinematic] [SCRIPT_TRIM] original_words=${rawScript.split(/\s+/).length} trimmed_words=${trimmedScript.split(/\s+/).length}`);

    // Build scene prompts — motion-only descriptions, no appearance
    let scenePrompts: string[] = (input.prompts as string[] | undefined) ?? [];
    if (scenePrompts.length < SCENE_COUNT) {
      // Call split-script if we have a script, otherwise use generic prompts
      if (trimmedScript.length > 10) {
        const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnyra.studio";
        try {
          const splitRes = await fetch(`${appUrl}/api/split-script`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ script: trimmedScript, num_segments: SCENE_COUNT, niche, goal }),
          });
          if (splitRes.ok) {
            const { segments } = await splitRes.json() as {
              segments: Array<{ visual_prompt?: string; text?: string }>;
            };
            scenePrompts = segments.map(s => s.visual_prompt || s.text || trimmedScript.slice(0, 120));
          }
        } catch { /* fallback below */ }
      }
      // Ensure we always have SCENE_COUNT prompts
      while (scenePrompts.length < SCENE_COUNT) {
        scenePrompts.push(goal || trimmedScript.slice(0, 120) || "cinematic lifestyle shot, natural light, 9:16");
      }
    }
    scenePrompts = scenePrompts.slice(0, SCENE_COUNT);

    await setJobStatus(jobId, "running", 15);

    // ── 2. Load brand + character memory ─────────────────────────────────────
    const [brandMemory, charMemory] = await Promise.all([
      loadBrandMemory(userId).catch(() => null),
      characterId ? loadCharacterMemory(characterId, userId).catch(() => null) : Promise.resolve(null),
    ]);

    const brandSuffix = brandMemory?.klingStyleSuffix ?? "";
    const charSuffix  = charMemory ? buildKlingCharacterSuffix(charMemory) : "";

    // ── 3. Generate ONE reference image for character consistency ─────────────
    // This single Flux Dev frame anchors the character/environment across all clips.
    // All Kling calls use this as the I2V source — motion-only prompts drive the action.
    await setJobStatus(jobId, "generating_clips", 15);

    const fluxT0 = Date.now();
    let referenceImageUrl: string | undefined;
    const subjectHint = charSuffix ? charSuffix.split(",")[0].trim() : "";
    const refPrompt = [
      subjectHint || "lifestyle creator, mid-shot",
      goal || trimmedScript.slice(0, 100),
      "establishing shot, full body visible, facing camera directly",
      "candid photography, sharp focus, natural light, real person",
      brandSuffix || "minimal clean background",
      "9:16 portrait, ultra-realistic, high detail",
    ].filter(Boolean).join(", ");

    const refNegative = [
      "nudity, nude, nsfw, sexual, explicit, bare skin, underwear",
      "extra limbs, deformed hands, bad anatomy, mutation, disfigured",
      "text, watermark, logo, signature, frame, border",
      "cartoon, anime, illustration, painting, cgi, render",
      "blurry, out of focus, low quality, pixelated, noise",
      "looking away, back turned, side profile",
    ].join(", ");

    try {
      const refFrame = await generateGetImgFrame({
        prompt:          refPrompt,
        negativePrompt:  refNegative,
        width:           768,
        height:          1344,
        useQualityModel: true,
      });
      referenceImageUrl = refFrame.imageUrl;
      console.log(`[run-cinematic] [CHARACTER_LOCK] flux_ms=${Date.now()-fluxT0} url=${referenceImageUrl.substring(0, 80)}`);
    } catch (refErr) {
      console.warn("[run-cinematic] reference image failed — falling back to T2V:", (refErr as Error).message);
    }
    const fluxMs = Date.now() - fluxT0;

    // ── 4. Generate Kling clips in parallel (I2V if reference available) ──────
    const klingT0 = Date.now();
    console.log(`[run-cinematic] generating ${SCENE_COUNT} clips in parallel mode=${referenceImageUrl ? "i2v" : "t2v"}`);
    await setJobStatus(jobId, "generating_clips", 20);

    const clipPromises = scenePrompts.map((prompt, i) =>
      generateKlingClip({
        shotId:        `${jobId}-${i}`,
        shotNumber:    i + 1,
        visualPrompt:  prompt,
        modelId:       referenceImageUrl ? KLING_I2V_PRO : KLING_T2V_PRO,
        imageUrl:      referenceImageUrl,
        durationSecs:  CLIP_DURATION,
        aspectRatio:   "9:16",
        brandSuffix,
        characterPromptSuffix: charSuffix,
        speedMode,
      }).catch(err => {
        console.error(`[run-cinematic] clip ${i} failed:`, err.message);
        return null;
      }),
    );

    const clipResults = await Promise.all(clipPromises);
    const klingMs = Date.now() - klingT0;
    const validClips  = clipResults.filter((c): c is NonNullable<typeof c> => c !== null);

    if (!validClips.length) {
      throw new Error("All clips failed to generate");
    }

    console.log(`[run-cinematic] [VIDEO_DURATION] sec=${validClips.length * CLIP_DURATION} clips=${validClips.length}`);
    await setJobStatus(jobId, "generating_audio", 60);

    // ── 5. Generate voiceover ─────────────────────────────────────────────────
    const voiceT0 = Date.now();
    let voiceoverUrl: string | undefined;
    let voiceDuration = TARGET_SECS;
    if (trimmedScript.length > 10) {
      try {
        const voResult = await generateVoiceover(
          { script: trimmedScript, targetDurationSecs: TARGET_SECS, voiceId },
          userId,
          jobId,
        );
        voiceoverUrl = voResult.audioUrl;
        voiceDuration = voResult.duration;
        console.log(`[run-cinematic] [AUDIO_DURATION] sec=${voiceDuration.toFixed(2)}`);
      } catch (voErr) {
        console.warn("[run-cinematic] voiceover failed (continuing without audio):", (voErr as Error).message);
      }
    }
    const voiceMs = Date.now() - voiceT0;

    await setJobStatus(jobId, "composing", 75);

    // ── 6. Stitch clips → final video ─────────────────────────────────────────
    const stitchT0 = Date.now();
    const stitchInput = validClips.map((c, i) => ({
      shotNumber:       i + 1,
      video_url:        c.video_url,
      duration_seconds: CLIP_DURATION,
    }));
    let finalVideoUrl: string;
    let stitchMs = 0;
    try {
      const stitchResult = await stitchClips(stitchInput, {
        voiceoverUrl,
        userId,
        planId:            jobId,
        targetSecs:        TARGET_SECS,
        voiceDurationSecs: voiceDuration,
        speedMode:         speedMode as "draft" | "balanced" | "quality" | "ultra-draft",
      });
      finalVideoUrl = stitchResult.output_url;
      stitchMs = Date.now() - stitchT0;
    } catch (stitchErr) {
      console.warn("[run-cinematic] stitch failed, using first clip:", (stitchErr as Error).message);
      finalVideoUrl = validClips[0].video_url;
      stitchMs = Date.now() - stitchT0;
    }

    // ── 6. Save to renders table ──────────────────────────────────────────────
    const { data: render, error: renderErr } = await supabaseAdmin
      .from("renders")
      .insert({
        user_id:      userId,
        status:       "complete",
        video_url:    finalVideoUrl,
        audio_url:    voiceoverUrl ?? null,
        script:       trimmedScript,
        template:     "cinematic",
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (renderErr) {
      console.error("[run-cinematic] renders insert error:", renderErr.message);
    } else {
      console.log(`[run-cinematic] [VIDEO_SAVED] render_id=${render.id} user=${userId}`);
    }

    // ── 7. Commit credits + mark job complete ────────────────────────────────
    const totalMs = Date.now() - t0;
    console.log(
      `[SPEED_BREAKDOWN] mode=${speedMode} | Flux=${fluxMs}ms | Kling=${klingMs}ms | Voice=${voiceMs}ms | Stitch=${stitchMs}ms | Total=${totalMs}ms` +
      ` | clips=${validClips.length} i2v=${!!referenceImageUrl}`,
    );

    await commitCredits(creditCost);

    await setJobStatus(jobId, "complete", 100, {
      video_url:    finalVideoUrl,
      completed_at: new Date().toISOString(),
    });

    console.log(`[run-cinematic] DONE job=${jobId} total_ms=${totalMs} clips=${validClips.length}`);
    return Response.json({ success: true, video_url: finalVideoUrl, total_ms: totalMs });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[run-cinematic] FAILED job=${jobId}:`, msg);
    await rollbackCredits();
    await setJobStatus(jobId, "failed", 0, { error: msg });
    return Response.json({ error: msg }, { status: 500 });
  }
}
