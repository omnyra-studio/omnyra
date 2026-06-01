/**
 * PATCH /api/characters/[id]  — update a character (name, prompts, ref_frame_url)
 * DELETE /api/characters/[id] — delete a character
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 10;

async function getUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: {
    name?: string;
    core_prompt?: string;
    visual_signature?: string;
    neg_prompt?: string;
    ref_frame_url?: string;
  };
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const updates: Record<string, string> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined)             updates.name             = body.name.trim();
  if (body.core_prompt !== undefined)      updates.core_prompt      = body.core_prompt.trim();
  if (body.visual_signature !== undefined) updates.visual_signature = body.visual_signature.trim();
  if (body.neg_prompt !== undefined)       updates.neg_prompt       = body.neg_prompt.trim();
  if (body.ref_frame_url !== undefined)    updates.ref_frame_url    = body.ref_frame_url;

  const { data, error } = await supabaseAdmin
    .from("character_registry")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, name, core_prompt, visual_signature, neg_prompt, ref_frame_url, updated_at")
    .single();

  if (error || !data) return Response.json({ error: "Character not found" }, { status: 404 });
  return Response.json({ character: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { error } = await supabaseAdmin
    .from("character_registry")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return Response.json({ error: "Delete failed" }, { status: 500 });
  return Response.json({ deleted: true });
}
