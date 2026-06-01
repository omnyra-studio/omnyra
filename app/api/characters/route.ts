/**
 * GET  /api/characters  — list the authenticated user's characters
 * POST /api/characters  — create a new character
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

export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("character_registry")
    .select("id, name, core_prompt, visual_signature, neg_prompt, ref_frame_url, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return Response.json({ error: "Failed to fetch characters" }, { status: 500 });
  return Response.json({ characters: data ?? [] });
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { name?: string; core_prompt?: string; visual_signature?: string; neg_prompt?: string };
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { name, core_prompt, visual_signature = "", neg_prompt = "" } = body;
  if (!name?.trim())        return Response.json({ error: "name is required" }, { status: 400 });
  if (!core_prompt?.trim()) return Response.json({ error: "core_prompt is required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("character_registry")
    .insert({
      user_id:          user.id,
      name:             name.trim(),
      core_prompt:      core_prompt.trim(),
      visual_signature: visual_signature.trim(),
      neg_prompt:       neg_prompt.trim(),
    })
    .select("id, name, core_prompt, visual_signature, neg_prompt, ref_frame_url, created_at")
    .single();

  if (error) {
    console.error("[characters] insert error:", error.message);
    return Response.json({ error: "Failed to create character" }, { status: 500 });
  }

  return Response.json({ character: data }, { status: 201 });
}
