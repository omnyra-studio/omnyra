import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getNicheSettings } from "@/lib/config/nicheSettings";

export const maxDuration = 30;

export async function POST(req: Request) {
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

  let title: string;
  let niche: string;
  let targetDuration: number;
  let aspectRatio: string;
  let sceneCount: number;

  try {
    const body = await req.json() as {
      title?: string;
      niche?: string;
      targetDuration?: number;
      aspectRatio?: string;
      sceneCount?: number;
    };
    niche         = body.niche ?? "lifestyle";
    title         = body.title?.trim() || `Video – ${new Date().toLocaleDateString()}`;
    targetDuration = body.targetDuration ?? 30;
    aspectRatio   = body.aspectRatio ?? "9:16";
    sceneCount    = body.sceneCount ?? 3;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const nicheSettings = getNicheSettings(niche);
  console.log(`[PROJECT_CREATE] user=${user.id} niche=${nicheSettings.key} duration=${targetDuration}`);

  const { data: project, error: insertErr } = await supabaseAdmin
    .from("projects")
    .insert({
      user_id:         user.id,
      title,
      niche:           nicheSettings.key,
      status:          "draft",
      target_duration: targetDuration,
      aspect_ratio:    aspectRatio,
      scene_count:     sceneCount,
    })
    .select("id, title, niche, status, scene_count, target_duration, aspect_ratio, created_at")
    .single();

  if (insertErr || !project) {
    console.error("[PROJECT_CREATE] insert failed:", insertErr?.message);
    return Response.json({ error: "Failed to create project" }, { status: 500 });
  }

  // Initialise story state for the project
  try {
    await supabaseAdmin.from("story_state").insert({
      project_id:      project.id,
      user_id:         user.id,
      current_arc:     nicheSettings.emotionalArc ?? "challenge → effort → resolution",
      current_emotion: "neutral",
      current_tension: 0.5,
      scene_index:     0,
    });
  } catch (err) {
    console.warn("[PROJECT_CREATE] story_state init failed (non-fatal):", (err as Error).message);
  }

  console.log(`[PROJECT_CREATE] ok projectId=${project.id}`);
  return Response.json({ project });
}
