/**
 * GET /api/cinematic-status?jobId=xxx
 *
 * Returns live status of a cinematic_jobs row.
 * Uses authenticated client so RLS restricts each user to their own jobs.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies }            from "next/headers";

export const maxDuration = 10;

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) return Response.json({ error: "jobId required" }, { status: 400 });

  const { data, error } = await supabase
    .from("cinematic_jobs")
    .select("id, status, progress, video_url, error, created_at, completed_at")
    .eq("id", jobId)
    .single();

  if (error || !data) return Response.json({ error: "Job not found" }, { status: 404 });

  return Response.json(data);
}
