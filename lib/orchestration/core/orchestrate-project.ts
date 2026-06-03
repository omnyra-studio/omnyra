/**
 * Top-level orchestration engine.
 * The ONLY real execution path — routes are HTTP adapters that call this.
 *
 * Responsibilities:
 *   1. Resolve or create project
 *   2. Apply mode config
 *   3. Delegate to generateShotPlan
 *   4. Return structured OrchestrateResult
 *
 * Workers (voiceover, shot rendering, composition) are enqueued separately
 * after this returns — this function exits as soon as the shot plan is persisted.
 */

 
import type { SupabaseClient } from "@supabase/supabase-js";
import { getModeConfig } from "@/lib/orchestration/mode-adapters";
import type { OrchestratorMode, OrchestrateResult } from "@/lib/orchestration/types";
import { generateShotPlan } from "./generate-shot-plan";
import { getQueue } from "@/lib/workers/queue";
import type { WorkerJob } from "@/lib/workers/types";
import { emit } from "@/lib/events/emitter";

export interface OrchestrateProjectInput {
  supabase:    SupabaseClient;
  userId:      string;
  mode:        OrchestratorMode;
  projectId?:  string;
  scriptId?:   string;
  scriptText?: string;
  platform?:   string;
}

export async function orchestrateProject(
  input: OrchestrateProjectInput,
): Promise<OrchestrateResult> {
  const { supabase, userId, mode } = input;
  const modeConfig = getModeConfig(mode);
  const platform   = input.platform?.trim() || modeConfig.platform_default;

  if (!input.scriptId?.trim() && !input.scriptText?.trim()) {
    throw new Error("Missing required field: scriptId or scriptText");
  }

  // correlationId starts as projectId (or a temp UUID before one exists).
  // It transitions to planId once the shot plan is created — planId is the
  // stable workflow identifier used by all downstream workers.
  const tempCorrelationId = input.projectId?.trim() ?? crypto.randomUUID();

  await emit({
    type:          "ORCHESTRATION_STARTED",
    correlationId: tempCorrelationId,
    payload:       { userId, mode, projectId: input.projectId },
  });

  // ── Resolve or create project ─────────────────────────────────────────────────
  let projectId = input.projectId?.trim();
  if (!projectId) {
    const { data: proj, error } = await supabase
      .from("projects")
      .insert({ user_id: userId, title: `${modeConfig.label} project`, status: "draft" })
      .select("id")
      .single();

    if (error || !proj) throw new Error(`Failed to create project: ${error?.message ?? "unknown"}`);
    projectId = proj.id as string;

    await emit({
      type:          "PROJECT_CREATED",
      correlationId: projectId,
      payload:       { projectId, mode, userId },
    });
  }

  // ── Generate shot plan (direct call — no HTTP) ────────────────────────────────
  const result = await generateShotPlan({
    supabase,
    userId,
    scriptId:   input.scriptId,
    scriptText: input.scriptText,
    projectId,
    platform,
    mode,
  });

  // generateShotPlan emits SHOT_PLAN_GENERATED — correlationId switches to planId here.

  // ── Enqueue workers (fire-and-forget) ────────────────────────────────────────
  // Shot render jobs run in parallel. Voiceover job runs concurrently.
  // The coordinator (called by each worker on completion) enqueues composition
  // automatically when all shots + voiceover are ready.
  const queue = getQueue();

  const shotJobs: WorkerJob[] = result.shots.map(shot => ({
    type:     "render_shot" as const,
    planId:   result.planId,
    shotDbId: (shot as unknown as { id?: string }).id ?? shot.shot_id,
    shotId:   shot.shot_id,
    userId,
  }));

  const voiceoverJob: WorkerJob = {
    type:   "generate_voiceover",
    planId: result.planId,
    userId,
  };

  await queue.enqueueAll([...shotJobs, voiceoverJob]);

  return {
    project_id: projectId,
    plan_id:    result.planId,
    mode,
  };
}
