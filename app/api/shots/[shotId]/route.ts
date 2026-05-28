/**
 * PATCH /api/shots/[shotId]
 *
 * Updates editable fields on a single shot row.
 * Only the authenticated shot owner (via shot_plan_id → project ownership) can update.
 *
 * Accepted body fields:
 *   scene_image_url   string | null   — selected scene image for this shot
 *   visual_prompt     string          — edited visual prompt
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ shotId: string }> },
) {
  const { shotId } = await params;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Whitelist — only these fields can be patched
  const allowed: Record<string, unknown> = {};
  if ("scene_image_url" in body) allowed.scene_image_url = body.scene_image_url ?? null;
  if ("visual_prompt"   in body) allowed.visual_prompt   = body.visual_prompt;

  if (!Object.keys(allowed).length) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // Ownership check — join through shot_plans to ensure the user owns the project
  const { data: shot, error: fetchErr } = await supabase
    .from("shots")
    .select("shot_id, shot_plan_id, shot_plans!inner(project_id, projects!inner(user_id))")
    .eq("shot_id", shotId)
    .single();

  if (fetchErr || !shot) {
    return NextResponse.json({ error: "Shot not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ownerId = (shot as any).shot_plans?.projects?.user_id as string | undefined;
  if (ownerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: updated, error: updateErr } = await supabase
    .from("shots")
    .update({ ...allowed, updated_at: new Date().toISOString() })
    .eq("shot_id", shotId)
    .select("shot_id, scene_image_url, visual_prompt")
    .single();

  if (updateErr) {
    console.error("[shots/patch] update error:", updateErr.message);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, shot: updated });
}
