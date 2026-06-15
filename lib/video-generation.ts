/**
 * lib/video-generation.ts — Unified video generation entry point for Omnyra.studio
 *
 * Orchestrates the full pipeline:
 *   1. Pre-flight: plan + credit check (canGenerateVideo)
 *   2. Prompt optimization (Ghost Test + speed trim)
 *   3. Duration enforcement (25–30s clamp)
 *   4. Dispatch to parallel engine (Kling / Hedra / Runway)
 *   5. Credit deduction on success
 *   6. Returns result with watermark flag
 *
 * Usage:
 *   import { generateVideo } from "@/lib/video-generation";
 *   const result = await generateVideo({ userId, userPlan, videoType, prompt });
 */

import { supabaseAdmin }            from "@/lib/supabase/admin";
import {
  getUserPlan,
  canGenerateVideo,
  getTargetVideoDuration,
  getSpeedOptimizations,
  CREDITS_PER_ACTION,
  PLANS,
  type UserPlan,
  type VideoType,
}                                   from "@/lib/billing";
import { buildVideoPrompt }         from "@/lib/prompt-optimizer";
import { runParallelEngine }        from "@/lib/orchestrator/parallel-engine";
import type { ParallelEngineInput } from "@/lib/orchestrator/parallel-engine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VideoGenerationInput {
  userId:           string;
  planId:           string;          // shot_plans row id
  videoType:        VideoType;
  prompt:           string;          // raw visual prompt (Ghost Test applied automatically)
  characterId?:     string;
  characterIds?:    string[];
  referenceImages?: string[];
  voiceId?:         string;
  fullScript?:      string;
  niche?:           string;
  aspectRatio?:     string;
}

export interface VideoGenerationResult {
  success:          boolean;
  assembledUrl?:    string;
  voiceoverUrl?:    string;
  duration:         number;
  watermarked:      boolean;
  creditsUsed:      number;
  creditsRemaining: number;
  plan:             UserPlan;
  generationMs:     number;
  error?:           string;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function generateVideo(
  input: VideoGenerationInput,
): Promise<VideoGenerationResult> {
  const t0 = Date.now();
  const { userId, planId, videoType, prompt, niche } = input;

  // ── 1. Plan & credit pre-flight ───────────────────────────────────────────
  const plan       = await getUserPlan(userId);
  const preflight  = await canGenerateVideo(userId, videoType, videoType === "avatar_30s");
  const planConfig = PLANS[plan];

  if (!preflight.allowed) {
    return {
      success:          false,
      error:            preflight.reason ?? "Video generation not allowed",
      duration:         preflight.duration,
      watermarked:      preflight.watermark,
      creditsUsed:      0,
      creditsRemaining: preflight.balance,
      plan,
      generationMs:     Date.now() - t0,
    };
  }

  // ── 2. Duration + speed config ────────────────────────────────────────────
  const targetDuration = getTargetVideoDuration(plan, videoType);
  const speedOpts      = getSpeedOptimizations(videoType, plan);
  const speedMode      = planConfig.speedMode;

  // ── 3. Optimize prompt (Ghost Test + trim for fast inference) ─────────────
  const isAvatar        = videoType === "avatar_30s";
  const optimizedPrompt = buildVideoPrompt(prompt, {
    characterRef: undefined, // character consistency handled by parallel engine
    isAvatar,
    duration: targetDuration,
  });

  console.info(
    `[VIDEO_GEN] plan=${plan} type=${videoType} duration=${targetDuration}s ` +
    `speedMode=${speedMode} watermark=${preflight.watermark} ` +
    `fastMode=${speedOpts.fastMode} promptLen=${optimizedPrompt.length}`,
  );

  // ── 4. Dispatch to parallel engine ────────────────────────────────────────
  const engineInput: ParallelEngineInput = {
    planId,
    userId,
    characterId:       input.characterId,
    characterIds:      input.characterIds,
    speedMode,
    draftMode:         speedMode === "ultra-draft" || speedMode === "draft",
    targetDurationSecs: targetDuration,
    aspectRatio:       input.aspectRatio ?? "9:16",
    fullScript:        input.fullScript,
    voiceId:           input.voiceId,
    maxClips:          videoType === "full_sequence_60s" ? 4 : 1,
    niche,
  };

  let engineResult;
  try {
    engineResult = await runParallelEngine(engineInput);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[VIDEO_GEN] engine error:", msg);
    // Surface provider-specific hints to the client
    const userMsg = msg.includes("FAL_KEY") || msg.includes("authentication failed")
      ? "Video provider authentication failed. Please contact support — the API key needs to be updated."
      : msg.includes("no clips were produced")
      ? "Video generation failed — the provider returned no results. Please try again in a moment."
      : msg.includes("timeout")
      ? "Video generation timed out. Try a shorter script or fewer scenes."
      : "Video generation failed. Please try again.";
    return {
      success:          false,
      error:            userMsg,
      duration:         targetDuration,
      watermarked:      preflight.watermark,
      creditsUsed:      0,
      creditsRemaining: preflight.balance,
      plan,
      generationMs:     Date.now() - t0,
    };
  }

  // Guard: engine completed but produced no assembled video (stitch failure with clips present)
  if (!engineResult.assembledUrl) {
    const clipCount = engineResult.clips.length;
    const userMsg = clipCount > 0
      ? `Video assembly failed — ${clipCount} clip(s) were generated but could not be stitched. Please try again.`
      : "Video generation produced no output. Please try again.";
    console.error(`[VIDEO_GEN] no assembledUrl planId=${planId} clips=${clipCount} failedShots=${engineResult.failedShots.length}`);
    return {
      success:          false,
      error:            userMsg,
      duration:         targetDuration,
      watermarked:      preflight.watermark,
      creditsUsed:      0,
      creditsRemaining: preflight.balance,
      plan,
      generationMs:     Date.now() - t0,
    };
  }

  // ── 5. Deduct credits on success ──────────────────────────────────────────
  const actionKey = isAvatar ? "avatar_30s"
    : videoType === "full_sequence_60s" ? "full_sequence_60s"
    : videoType === "preview" ? "video_preview"
    : "cinematic_30s";
  const creditsUsed = CREDITS_PER_ACTION[actionKey] ?? 40;

  await supabaseAdmin.rpc("deduct_credits_atomic", {
    p_user_id: userId,
    p_amount:  creditsUsed,
  });

  // Log usage for monthly limit tracking
  void supabaseAdmin.from("usage_logs").insert({
    user_id:     userId,
    action_type: actionKey,
    credits:     creditsUsed,
    metadata:    { planId, videoType, targetDuration, speedMode },
  });

  const creditsRemaining = preflight.balance - creditsUsed;

  return {
    success:          true,
    assembledUrl:     engineResult.assembledUrl,
    voiceoverUrl:     engineResult.voiceoverUrl,
    duration:         engineResult.targetDurationSecs,
    watermarked:      preflight.watermark,
    creditsUsed,
    creditsRemaining: Math.max(0, creditsRemaining),
    plan,
    generationMs:     Date.now() - t0,
  };
}

// ── Convenience exports ───────────────────────────────────────────────────────

export { getUserPlan, canGenerateVideo, getTargetVideoDuration } from "@/lib/billing";
export { optimizePrompt, buildVideoPrompt, applyGhostTest }      from "@/lib/prompt-optimizer";
