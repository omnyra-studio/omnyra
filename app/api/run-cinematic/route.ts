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

import Anthropic                 from "@anthropic-ai/sdk";
import { supabaseAdmin }         from "@/lib/supabase/admin";
import { generateKlingClip }     from "@/lib/orchestrator/kling-worker";
import { generateVoiceover }     from "@/lib/orchestrator/elevenlabs-worker";
import { stitchClips }           from "@/lib/orchestrator/clip-stitcher";
import { KLING_T2V_PRO, KLING_T2V_MODEL, KLING_I2V_PRO, KLING_I2V_MODEL } from "@/lib/video-models";
import { loadBrandMemory }       from "@/lib/memory/brand-memory";
import { loadCharacterMemory, buildKlingCharacterSuffix } from "@/lib/memory/character-memory";
import { generateGetImgFrame }   from "@/lib/orchestrator/getimg-worker";

export const maxDuration = 600;

const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaO";

// Animated/cartoon style — affects reference image prompts, Kling prompts, and negative prompts
const ANIMATED_RE = /\b(animated|animation|cartoon|3d animated|disney|pixar|dreamworks|anime|cgi character|stylized character|princess peach|mario|luigi|bowser|zelda|kirby|pikachu|yoshi|wario|donkey kong|storybook character|muppet|puppet|fictional character|historical cartoon)\b/i;
const ANIMATION_STYLE_PREFIX = "In vibrant Disney Pixar 3D animated style, colorful cartoon characters with big expressive eyes, smooth CGI animation, stylized proportions, highly detailed 3D animated render, cinematic lighting, ";
const CINEMATIC_QUALITY_PREFIX = "Highly detailed cinematic shot, accurate anatomy, correct lighting, no deformities, sharp focus, natural facial expression, ";
const ANIM_NEGATIVE_PROMPT = "photorealistic, realistic humans, live action, real people, photograph, photo, human skin texture, detailed pores, realistic faces, 35mm film, documentary style, human actors, candid photography, stock photo, blurry, deformed, extra limbs, text, watermark, low quality, ugly, bad anatomy, nsfw";

function detectAnimatedStyle(text: string): boolean {
  return ANIMATED_RE.test(text);
}

// Expands a short brief/script to ~targetWords using Claude Haiku for fast, cheap expansion.
// Used as a server-side safety net when the client sends a < 50-word script.
// Falls back silently to the original if Claude is unavailable or times out.
async function expandScriptForDuration(brief: string, targetWords = 80): Promise<string> {
  const wordCount = brief.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount >= targetWords) return brief;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.warn("[SCRIPT_EXPANDED] ANTHROPIC_API_KEY missing — skipping expansion"); return brief; }
  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 350,
      messages:   [{
        role:    "user",
        content: `Expand this video script to approximately ${targetWords} words for a 30-second narration. Keep the emotional tone, story arc, and key message perfectly intact. Return ONLY the expanded script — no labels, no explanation, no quotes.\n\nOriginal script: ${brief}`,
      }],
    });
    const expanded = (msg.content[0] as { type: string; text: string }).text?.trim() ?? "";
    const newCount = expanded.split(/\s+/).filter(Boolean).length;
    console.log(`[SCRIPT_EXPANDED] original=${wordCount} → expanded=${newCount} target=${targetWords}`);
    return expanded || brief;
  } catch (e) {
    console.warn("[SCRIPT_EXPANDED] expansion failed — using original:", (e as Error).message.substring(0, 80));
    return brief;
  }
}

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
    const lightningMode = !!input.lightningMode;
    // Explicit speedMode from client wins; lightningMode is the backward-compat toggle
    const speedMode    = (input.speedMode as string | undefined) ?? (lightningMode ? "ultra-draft" : "draft");
    const isUltraDraft = speedMode === "ultra-draft";

    // Lightning: 2 scenes × 5s = 10s clip bed; Normal: 3 scenes × 10s = 30s clip bed.
    // Voiceover duration drives the final output length (clips loop via stream_loop if needed).
    const SCENE_COUNT   = Math.min((input.maxClips as number | undefined) ?? (isUltraDraft ? 2 : 3), 3);
    const CLIP_DURATION = isUltraDraft ? 5 : 10;  // 5s clips generate ~30s faster per clip
    const TARGET_SECS   = SCENE_COUNT * CLIP_DURATION;
    const MIN_OUTPUT_SECS = isUltraDraft ? 20 : 26; // hard floor — final video never shorter than this

    // Model selection: ultra-draft uses v3 standard (shorter queue), all other modes use v3 pro
    const klingT2V = isUltraDraft ? KLING_T2V_MODEL : KLING_T2V_PRO;
    const klingI2V = isUltraDraft ? KLING_I2V_MODEL : KLING_I2V_PRO;

    const trimmedScript = trimToWords(rawScript || goal, 300);
    console.log(`[LIGHTNING_ENFORCED] mode=${speedMode} scenes=${SCENE_COUNT} clip_dur=${CLIP_DURATION}s target=${TARGET_SECS}s model=v3-${isUltraDraft ? "standard" : "pro"} lightning=${lightningMode}`);
    console.log(`[run-cinematic] [DURATION_LOCK] mode=${speedMode} scenes=${SCENE_COUNT} clip_sec=${CLIP_DURATION} target=${TARGET_SECS}s`);
    console.log(`[run-cinematic] [SCRIPT_TRIM] original_words=${rawScript.split(/\s+/).length} scene_split_words=${trimmedScript.split(/\s+/).length}`);

    // ── Animated style detection ─────────────────────────────────────────────
    const isAnimated = detectAnimatedStyle(`${rawScript} ${goal} ${niche}`);
    console.log(`[run-cinematic] [ANIMATED_DETECT] isAnimated=${isAnimated} niche="${niche}" goal="${goal.slice(0, 80)}"`);

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

    // Inject style prefix into every scene prompt.
    // Animated: Disney/Pixar 3D. Non-animated: cinematic quality guard.
    if (isAnimated) {
      scenePrompts = scenePrompts.map(p => ANIMATION_STYLE_PREFIX + p);
      console.log(`[STYLE_ENFORCED] animation=true niche="${niche}" prefix="${ANIMATION_STYLE_PREFIX.substring(0, 60)}" scenes=${scenePrompts.length}`);
    } else {
      scenePrompts = scenePrompts.map(p => CINEMATIC_QUALITY_PREFIX + p);
      console.log(`[STYLE_ENFORCED] cinematic=true prefix="${CINEMATIC_QUALITY_PREFIX.substring(0, 60)}" scenes=${scenePrompts.length}`);
    }

    await setJobStatus(jobId, "running", 15);

    // ── 2. Load brand + character memory ─────────────────────────────────────
    const [brandMemory, charMemory] = await Promise.all([
      loadBrandMemory(userId).catch(() => null),
      characterId ? loadCharacterMemory(characterId, userId).catch(() => null) : Promise.resolve(null),
    ]);

    const brandSuffix = brandMemory?.klingStyleSuffix ?? "";
    const charSuffix  = charMemory ? buildKlingCharacterSuffix(charMemory) : "";

    // ── 3. Generate ONE reference image for character consistency ─────────────
    // Lightning mode skips Flux entirely (T2V is faster without reference anchoring).
    // Standard mode uses Flux schnell (4 steps) for speed; quality uses Dev (28 steps).
    await setJobStatus(jobId, "generating_clips", 15);

    const fluxT0 = Date.now();
    let referenceImageUrl: string | undefined;

    if (!lightningMode) {
      const subjectHint = charSuffix ? charSuffix.split(",")[0].trim() : "";

      const refPrompt = isAnimated
        ? [
            "highly detailed 3D Disney Pixar style animated character",
            subjectHint || goal.slice(0, 80),
            "stylized cartoon, vibrant colors, expressive face, smooth CGI surfaces",
            "animated film still, studio lighting, 9:16 portrait, no photorealism",
          ].filter(Boolean).join(", ")
        : [
            subjectHint || "lifestyle creator, mid-shot",
            goal || trimmedScript.slice(0, 100),
            "establishing shot, full body visible, facing camera directly",
            "candid photography, sharp focus, natural light, real person",
            brandSuffix || "minimal clean background",
            "9:16 portrait, ultra-realistic, high detail",
          ].filter(Boolean).join(", ");

      const refNegative = isAnimated
        ? "photorealistic, live action, real people, blurry, deformed, extra limbs, text, watermark, nsfw, nude"
        : [
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
          useQualityModel: false,
        });
        referenceImageUrl = refFrame.imageUrl;
        console.log(`[run-cinematic] [CHARACTER_LOCK] flux_ms=${Date.now()-fluxT0} url=${referenceImageUrl.substring(0, 80)}`);
      } catch (refErr) {
        console.warn("[run-cinematic] getimg failed — trying fal.ai flux/schnell fallback:", (refErr as Error).message);
      }

      // fal.ai flux/schnell fallback when getimg is unavailable or 401s
      if (!referenceImageUrl) {
        try {
          const { fal: falClient } = await import("@fal-ai/client");
          const FAL_CREDS = process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY;
          if (!FAL_CREDS) throw new Error("No FAL credentials");
          falClient.config({ credentials: FAL_CREDS });
          console.log(`[run-cinematic] [GETIMG_MISSING] using fal.ai flux/schnell fallback`);
          const falResult = await falClient.subscribe("fal-ai/flux/schnell", {
            input: {
              prompt:               refPrompt,
              image_size:           "portrait_4_3" as const,
              num_inference_steps:  4,
              num_images:           1,
            },
          });
          const images = (falResult as Record<string, unknown>).images as Array<{ url: string }> | undefined;
          referenceImageUrl = images?.[0]?.url;
          if (referenceImageUrl) {
            console.log(`[run-cinematic] [FAL_FALLBACK] reference image ok ms=${Date.now()-fluxT0} url=${referenceImageUrl.substring(0, 80)}`);
          }
        } catch (falErr) {
          console.warn("[run-cinematic] fal.ai fallback also failed — using T2V:", (falErr as Error).message);
        }
      }
    } else {
      console.log(`[run-cinematic] [CHARACTER_LOCK] SKIPPED (lightning mode — pure T2V for speed)`);
    }
    const fluxMs = Date.now() - fluxT0;

    // ── 4+5. PARALLEL: Kling clips + voiceover fire simultaneously ───────────────
    const parallelT0 = Date.now();
    console.log(`[run-cinematic] [PARALLEL_START] ${SCENE_COUNT} clips + voiceover firing simultaneously mode=${referenceImageUrl ? "i2v" : "t2v"} dur=${CLIP_DURATION}s each`);
    await setJobStatus(jobId, "generating_clips", 20);

    // Clip generator with I2V→T2V timeout fallback
    const makeClip = async (prompt: string, i: number) => {
      const clipT0 = Date.now();
      const baseConfig = {
        shotId:                `${jobId}-${i}`,
        shotNumber:            i + 1,
        visualPrompt:          prompt,
        modelId:               referenceImageUrl ? klingI2V : klingT2V,
        imageUrl:              referenceImageUrl,
        durationSecs:          CLIP_DURATION,
        aspectRatio:           "9:16" as const,
        brandSuffix,
        characterPromptSuffix: charSuffix,
        speedMode,
        isStylized:            isAnimated,
        negativePrompt:        isAnimated ? ANIM_NEGATIVE_PROMPT : undefined,
      };
      try {
        const r = await generateKlingClip(baseConfig);
        console.log(`[KLING_CLIP_OK] clip=${i} ms=${Date.now()-clipT0} model=${r.model_used}`);
        return r;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (referenceImageUrl) {
          // I2V timed out or failed → retry as pure T2V (no reference, faster queue)
          console.warn(`[LIGHTNING_KLING] I2V failed → T2V fallback clip=${i}: ${msg.slice(0, 80)}`);
          try {
            const r2 = await generateKlingClip({ ...baseConfig, modelId: klingT2V, imageUrl: undefined, shotId: `${jobId}-${i}-t2v` });
            console.log(`[LIGHTNING_KLING] T2V fallback ok clip=${i} ms=${Date.now()-clipT0}`);
            return r2;
          } catch (err2) {
            console.error(`[LIGHTNING_KLING] T2V fallback FAILED clip=${i}:`, (err2 as Error).message.slice(0, 80));
          }
        } else {
          console.error(`[run-cinematic] clip=${i} failed (no fallback):`, msg.slice(0, 80));
        }
        return null;
      }
    };

    // Full script voiceover — 'cinematic' mode bypasses word cap entirely.
    // Server-side safety net: if the script is < 50 words (brief fallback from client),
    // expand it to ~80 words so the voiceover fills the full 30s clip bed.
    const voiceScriptRaw  = rawScript || goal;
    const voiceWordRaw    = voiceScriptRaw.trim().split(/\s+/).filter(Boolean).length;
    const voiceScript = (!isUltraDraft && voiceWordRaw < 50)
      ? await expandScriptForDuration(voiceScriptRaw, 80)
      : voiceScriptRaw;
    const voiceWordCount = voiceScript.trim().split(/\s+/).filter(Boolean).length;
    console.log(`[VOICEOVER_CINEMATIC] rawWords=${voiceWordRaw} finalWords=${voiceWordCount} targetSecs=${TARGET_SECS} voiceId=${voiceId} expanded=${voiceWordRaw < 50 && !isUltraDraft}`);

    const [clipResults, voResult] = await Promise.all([
      Promise.all(scenePrompts.map((p, i) => makeClip(p, i))),
      voiceScript.length > 10
        ? generateVoiceover(
            { script: voiceScript, targetDurationSecs: TARGET_SECS, voiceId, speedMode: "cinematic", speed: isUltraDraft ? 1.15 : 1.05 },
            userId,
            jobId,
          ).catch(e => {
            console.warn("[run-cinematic] voiceover failed:", (e as Error).message);
            return { audioUrl: undefined as string | undefined, duration: TARGET_SECS, scriptUsed: voiceScript };
          })
        : Promise.resolve({ audioUrl: undefined as string | undefined, duration: TARGET_SECS, scriptUsed: voiceScript }),
    ]);

    const parallelMs   = Date.now() - parallelT0;
    const voiceoverUrl = voResult.audioUrl;
    const voiceDuration = voResult.duration;
    const validClips   = clipResults.filter((c): c is NonNullable<typeof c> => c !== null);

    const expectedFinalDuration = Math.max(voiceDuration, MIN_OUTPUT_SECS);
    console.log(`[PARALLEL_DONE] totalMs=${parallelMs} clips=${validClips.length}/${SCENE_COUNT} voice=${!!voiceoverUrl} voiceDuration=${voiceDuration.toFixed(1)}s`);
    console.log(`[DURATION_ENFORCED] voice=${voiceDuration.toFixed(1)}s min=${MIN_OUTPUT_SECS}s final_target=${expectedFinalDuration.toFixed(1)}s clips=${validClips.length}×${CLIP_DURATION}s`);

    if (!validClips.length) {
      throw new Error("All clips failed to generate");
    }

    console.log(`[run-cinematic] [VIDEO_DURATION] sec=${validClips.length * CLIP_DURATION} clips=${validClips.length}`);
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
        minDurationSecs:   MIN_OUTPUT_SECS,
        speedMode:         speedMode as "draft" | "balanced" | "quality" | "ultra-draft",
      });
      finalVideoUrl = stitchResult.output_url;
      stitchMs = Date.now() - stitchT0;
      console.log(`[FINAL_VIDEO] duration=${stitchResult.duration_seconds.toFixed(1)}s clips=${stitchResult.clip_count} hasAudio=${!!voiceoverUrl} url=${finalVideoUrl.substring(0, 80)}`);
    } catch (stitchErr) {
      console.warn("[run-cinematic] stitch failed, using first clip:", (stitchErr as Error).message);
      finalVideoUrl = validClips[0].video_url;
      stitchMs = Date.now() - stitchT0;
    }

    // ── 6. Save to renders table ──────────────────────────────────────────────
    console.log(`[SAVE_RENDER] user=${userId} video=${finalVideoUrl.substring(0, 80)} template=cinematic status=attempting`);
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
      console.error(`[SAVE_RENDER] FAILED user=${userId} code=${renderErr.code} msg=${renderErr.message}`);
    } else {
      console.log(`[SAVE_RENDER] user=${userId} render_id=${render.id} video=${finalVideoUrl.substring(0, 80)} status=success`);
    }

    // ── 7. Commit credits + mark job complete ────────────────────────────────
    const totalMs = Date.now() - t0;
    console.log(
      `[SPEED_BREAKDOWN] mode=${speedMode} | Flux=${fluxMs}ms | Parallel(clips+voice)=${parallelMs}ms | Stitch=${stitchMs}ms | Total=${totalMs}ms` +
      ` | clips=${validClips.length} i2v=${!!referenceImageUrl} finalTarget=${expectedFinalDuration.toFixed(1)}s`,
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
