/**
 * GET /api/job-status?id=<jobId>
 *
 * Returns the current state of an avatar_jobs record.
 * Enforces ownership — users can only query their own jobs.
 *
 * Returns:
 *   { id, status, stage, result_url, animated_video_url, error, retry_count, created_at, updated_at }
 *
 * Error responses:
 *   401 — not authenticated
 *   400 — missing id param
 *   404 — job not found or not owned by user
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 10;

export async function GET(req: Request) {
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

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id?.trim()) {
    return Response.json({ error: "Missing required param: id" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("avatar_jobs")
    .select(
      "id, status, stage, result_url, animated_video_url, error, retry_count, created_at, updated_at"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[job-status] DB error:", error.message);
    return Response.json({ error: "Failed to fetch job status" }, { status: 500 });
  }

  if (!data) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  return Response.json(data);
}
