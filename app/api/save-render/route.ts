import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
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

  const body = await req.json() as {
    video_url: string;
    audio_url?: string | null;
    script?: string | null;
    template?: string | null;
    series_id?: string | null;
    episode_number?: number | null;
    parent_render_id?: string | null;
    continuation_prompt?: string | null;
  };

  if (!body.video_url?.trim() || body.video_url.startsWith("blob:")) {
    return NextResponse.json({ error: "video_url must be a permanent public URL" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("renders")
    .insert({
      user_id:             user.id,
      status:              "complete",
      video_url:           body.video_url,
      audio_url:           body.audio_url ?? null,
      script:              body.script ?? null,
      template:            body.template ?? null,
      completed_at:        new Date().toISOString(),
      series_id:           body.series_id ?? null,
      episode_number:      body.episode_number ?? null,
      parent_render_id:    body.parent_render_id ?? null,
      continuation_prompt: body.continuation_prompt ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[save-render] insert error:", error.message, "code:", error.code);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[save-render] saved render id=${data.id} user=${user.id} template=${body.template}`);
  return NextResponse.json({ success: true, id: data.id });
}
