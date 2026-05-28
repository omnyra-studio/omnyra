import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { hookId: string; projectId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { hookId, projectId } = body;
  if (!hookId || !projectId) {
    return NextResponse.json({ error: "hookId and projectId required" }, { status: 400 });
  }

  // Mark the selected hook
  const { error: hookErr } = await supabase
    .from("hooks")
    .update({ status: "selected" })
    .eq("id", hookId)
    .eq("project_id", projectId);

  if (hookErr) {
    console.warn("[select-hook] hook update error:", hookErr.message);
  }

  // Record in creator memory (non-fatal)
  const { data: hookRow } = await supabase
    .from("hooks")
    .select("hook_text")
    .eq("id", hookId)
    .single();

  if (hookRow?.hook_text) {
    await supabase.from("creator_memory").insert({
      user_id: user.id,
      memory_type: "hook_selected",
      content: hookRow.hook_text,
      metadata: { project_id: projectId, hook_id: hookId },
      source_project_id: projectId,
    });
  }

  return NextResponse.json({ success: true });
}
