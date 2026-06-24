import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { compileSceneGraph } from "@/lib/services/scene-compiler";
import { runDirector, buildDirectorInjection } from "@/lib/services/ai-director";
import { analyzeViralPotential, buildViralCompilerHints } from "@/lib/services/viral-optimizer";
import { loadBrandMemory } from "@/lib/memory/brand-memory";
import type { CompilerInput } from "@/lib/types/scene-compiler";

export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Load project — RLS enforces ownership
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, user_id, title, niche, scene_count, target_duration, aspect_ratio")
    .eq("id", projectId)
    .single();

  if (projErr || !project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.user_id !== user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let script: string;
  let concept: string;
  let characterRef: string | undefined;
  let referenceImages: string[] | undefined;

  try {
    const body = await req.json() as {
      script?: string;
      concept?: string;
      characterRef?: string;
      referenceImages?: string[];
    };
    script   = body.script?.trim() ?? "";
    concept  = body.concept?.trim() ?? project.title;
    characterRef   = body.characterRef;
    referenceImages = body.referenceImages;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!script && !concept) {
    return Response.json({ error: "script or concept required" }, { status: 400 });
  }

  // Mark project as compiling
  await supabaseAdmin.from("projects").update({ status: "compiling" }).eq("id", projectId);

  // Load brand memory + story state in parallel
  const brandMemory = await loadBrandMemory(user.id).catch(() => null);

  const storyStateRes = await supabaseAdmin
    .from("story_state")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  const storyStateRow = storyStateRes.data;

  const storyMemory: import("@/lib/memory/story-memory").StoryMemory | undefined = storyStateRow
    ? {
        project_id:   projectId,
        story_arc:    storyStateRow.current_arc ?? "challenge → effort → resolution",
        scene_progression: [],
        current_state: {
          emotion:       storyStateRow.current_emotion ?? "neutral",
          tension_level: storyStateRow.current_tension ?? 0.5,
          location_state: storyStateRow.last_event ?? "establishing",
        },
        active_continuity_objects: storyStateRow.active_objects ?? [],
        lightingVector: storyStateRow.lighting_vector ?? "natural cinematic",
        cameraVector:   storyStateRow.camera_vector ?? "static",
        scenesSoFar:    storyStateRow.scene_index ?? 0,
      }
    : undefined;

  console.log(`[GENERATE_SCENES] projectId=${projectId} niche=${project.niche} sceneCount=${project.scene_count}`);

  // AI Director: run before Scene Compiler — produces hook strategy, emotional arc, shot plan.
  // Ghost Emotional Intelligence Layer runs in parallel inside runDirector (invisible to user).
  let directorContext = '';
  let effectiveScript = script;
  try {
    const plan = await runDirector({
      userPrompt:  concept,
      script,
      niche:       project.niche,
      sceneCount:  project.scene_count,
      brandVoice:  brandMemory?.toneKeywords?.join(", ") ?? undefined,
    });
    directorContext = buildDirectorInjection(plan);
    if (plan.enhanced_script) effectiveScript = plan.enhanced_script;

    // Viral optimizer — score the Director plan and add rewrite hints for the compiler
    const viralAnalysis = analyzeViralPotential(plan);
    if (viralAnalysis.compilerHints) {
      directorContext += buildViralCompilerHints(viralAnalysis);
    }
    console.log(`[DIRECTOR] hook="${plan.hook_type}" arc=[${plan.emotional_arc?.join("→")}] viral=${viralAnalysis.score}/100 (${viralAnalysis.grade})`);
  } catch (dirErr) {
    console.warn("[DIRECTOR] failed (non-fatal):", (dirErr as Error).message);
  }

  const compilerInput: CompilerInput = {
    script: effectiveScript,
    concept: directorContext ? `${directorContext}\n\nOriginal concept: ${concept}` : concept,
    hook: undefined,
    niche:          project.niche,
    aspectRatio:    project.aspect_ratio,
    sceneCount:     project.scene_count,
    characterRef,
    referenceImages,
    brandMemory:    brandMemory ?? undefined,
    storyMemory,
  };

  let compiled;
  try {
    compiled = await compileSceneGraph(compilerInput);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[GENERATE_SCENES] compile failed: ${msg}`);
    await supabaseAdmin.from("projects").update({ status: "failed" }).eq("id", projectId);
    return Response.json({ error: "Scene compilation failed", detail: msg }, { status: 500 });
  }

  // Persist scenes to DB
  const sceneRows = compiled.scene_graph.map((scene, i) => ({
    project_id:     projectId,
    user_id:        user.id,
    scene_index:    i,
    narrative_role: scene.narrative_role,
    image_prompt:   scene.image_prompt,
    video_prompt:   scene.video_prompt,
    negative_prompt: scene.negative_prompt,
    camera_state:   scene.camera,
    character_state: scene.character_state,
    scene_state:    { environment: scene.environment, continuity: scene.continuity },
    status:         "pending" as const,
  }));

  const { error: scenesErr } = await supabaseAdmin
    .from("scenes")
    .upsert(sceneRows, { onConflict: "project_id,scene_index" });

  if (scenesErr) {
    console.error("[GENERATE_SCENES] scenes insert failed:", scenesErr.message);
  }

  // Update project status + scene count
  await supabaseAdmin.from("projects").update({
    status:      "draft",
    scene_count: compiled.scene_graph.length,
  }).eq("id", projectId);

  // Return the compiled scene graph (video_prompt and negative_prompt are internal — strip before returning)
  const publicScenes = compiled.scene_graph.map(scene => ({
    scene_id:       scene.scene_id,
    timing:         scene.timing,
    narrative_role: scene.narrative_role,
    camera:         scene.camera,
    character_state: scene.character_state,
    environment:    scene.environment,
    continuity:     scene.continuity,
    // Internal prompt fields stripped — never sent to client
  }));

  console.log(`[GENERATE_SCENES] ok projectId=${projectId} scenes=${publicScenes.length}`);
  return Response.json({
    projectId,
    sceneCount: publicScenes.length,
    scenes:     publicScenes,
    globalStyle: compiled.global_style,
  });
}
