/**
 * POST /api/project/:id/generate
 *
 * Orchestration endpoint — starts the full Agent Swarm pipeline for a project:
 *   1. Load brand memory + init story memory
 *   2. Run Agent Swarm (Director → Planner → Cine+Emotion → Prompt Compiler)
 *   3. Generate scene images via Flux Dev
 *   4. Enqueue scene render jobs in BullMQ
 *   5. Return scene graph + queue job IDs for status polling
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { runAgentSwarm, type SwarmInput } from "@/lib/agents/swarm";
import { loadBrandMemory } from "@/lib/memory/brand-memory";
import { initStoryMemory } from "@/lib/memory/story-memory";
import { selectModel } from "@/lib/queue/cost-router";
import { enqueueSceneRender } from "@/lib/queue/queues";
import type { PlannedScene } from "@/lib/agents/scene-planner";
import type { CinematographySpec } from "@/lib/agents/cinematography";

export const maxDuration = 120;

interface GenerateBody {
  script:               string;
  concept:              string;
  niche:                string;
  hook?:                string;
  targetAudience?:      string;
  characterDescription: string;
  aspectRatio?:         string;
  sceneCount?:          number;
  brandId?:             string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as GenerateBody;
  const {
    script,
    concept,
    niche        = "lifestyle",
    hook,
    targetAudience,
    characterDescription = "",
    aspectRatio  = "9:16",
    sceneCount   = 4,
    brandId      = "default",
  } = body;

  if (!script || !concept) {
    return NextResponse.json({ error: "script and concept are required" }, { status: 400 });
  }

  try {
    // ── Step 1: Load memory ───────────────────────────────────────────────────
    const brandMemory = await loadBrandMemory(user.id, brandId);
    const storyMemory = initStoryMemory(projectId, null, "emotional journey");

    // ── Step 2: Run Agent Swarm ───────────────────────────────────────────────
    const swarmInput: SwarmInput = {
      script,
      concept,
      niche,
      hook,
      targetAudience,
      characterDescription,
      brandMemory,
      sceneCount,
    };

    const swarm = await runAgentSwarm(swarmInput);

    // ── Step 3: Generate scene images (Flux Dev) ──────────────────────────────
    const imageResults = await Promise.all(
      swarm.prompts.map(async (compiled, i) => {
        const scene = swarm.plan.scenes[i];
        try {
          const falRes = await fetch("https://fal.run/fal-ai/flux/dev", {
            method:  "POST",
            headers: {
              Authorization:  `Key ${process.env.FAL_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              prompt:               compiled.image_prompt,
              negative_prompt:      compiled.negative_prompt,
              num_inference_steps:  28,
              guidance_scale:       3.5,
              num_images:           1,
              image_size:           aspectRatio === "16:9" ? "landscape_16_9" : "portrait_4_3",
              output_format:        "jpeg",
              enable_safety_checker: false,
            }),
          });
          const falData = await falRes.json() as { images?: Array<{ url: string }> };
          return { scene_id: scene.scene_id, image_url: falData.images?.[0]?.url ?? null };
        } catch {
          return { scene_id: scene.scene_id, image_url: null };
        }
      }),
    );

    // ── Step 4: Enqueue render jobs ───────────────────────────────────────────
    const queueJobs = await Promise.all(
      swarm.plan.scenes.map(async (scene: PlannedScene, i: number) => {
        const compiled  = swarm.prompts[i];
        const cinSpec   = swarm.cinematography[i] as CinematographySpec;
        const imageUrl  = imageResults[i]?.image_url;

        if (!imageUrl) return { scene_id: scene.scene_id, job_id: null, skipped: true };

        const routerInput = {
          narrative_role:    scene.narrative_role,
          motion_complexity: cinSpec?.motion_complexity ?? "medium",
          duration_secs:     scene.duration_secs,
          priority:          scene.priority,
        };
        const { model } = selectModel(routerInput);

        const jobId = await enqueueSceneRender({
          project_id:        projectId,
          scene_id:          scene.scene_id,
          image_url:         imageUrl,
          video_prompt:      compiled.video_prompt,
          negative_prompt:   compiled.negative_prompt,
          duration_secs:     scene.duration_secs,
          model,
          aspect_ratio:      aspectRatio,
          narrative_role:    scene.narrative_role,
          motion_complexity: cinSpec?.motion_complexity ?? "medium",
          priority:          scene.priority,
          attempt:           1,
        });

        return { scene_id: scene.scene_id, job_id: jobId, model };
      }),
    );

    // ── Step 5: Persist scene graph to Supabase ───────────────────────────────
    // Fire-and-forget — don't block the response on DB write
    void (async () => {
      for (let i = 0; i < swarm.plan.scenes.length; i++) {
        const scene   = swarm.plan.scenes[i];
        const compiled = swarm.prompts[i];
        const imageUrl = imageResults[i]?.image_url;
        const job      = queueJobs[i];

        await supabase.from("scenes").upsert({
          project_id:    projectId,
          user_id:       user.id,
          scene_id:      scene.scene_id,
          narrative_role: scene.narrative_role,
          duration_secs:  scene.duration_secs,
          image_prompt:   compiled.image_prompt,
          video_prompt:   compiled.video_prompt,
          negative_prompt: compiled.negative_prompt,
          image_url:      imageUrl ?? null,
          model_used:     job?.model ?? "kling",
          render_status:  imageUrl ? "queued" : "pending",
          queue_job_id:   job?.job_id ?? null,
          priority:       scene.priority,
        }, { onConflict: "project_id,scene_id" });
      }
    })();

    return NextResponse.json({
      ok:         true,
      project_id: projectId,
      scenes:     swarm.plan.scenes.map((s, i) => ({
        scene_id:      s.scene_id,
        narrative_role: s.narrative_role,
        image_url:     imageResults[i]?.image_url ?? null,
        job_id:        queueJobs[i]?.job_id ?? null,
        model:         queueJobs[i]?.model ?? "kling",
      })),
      swarm_meta: {
        total_agent_ms: swarm.totalAgentMs,
        director_tone:  swarm.director.tone,
        story_arc:      swarm.plan.story_arc,
      },
    });
  } catch (err) {
    console.error("[/api/project/:id/generate] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
