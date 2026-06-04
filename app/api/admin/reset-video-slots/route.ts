/**
 * POST /api/admin/reset-video-slots
 *
 * Resets stuck concurrent_video_jobs counters in rate_limit_state.
 * Use when users are permanently 429'd after a Vercel timeout/crash
 * left the counter stuck above VIDEO_MAX_CONCURRENT (2).
 *
 * Protected by x-admin-secret header.
 *
 * Body (optional): { userId: string }  — omit to reset ALL stuck rows.
 *
 * Usage:
 *   curl -X POST https://your-app.vercel.app/api/admin/reset-video-slots \
 *     -H "x-admin-secret: $ADMIN_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"userId":"<optional-user-id>"}'
 */

import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (secret) {
    const provided = req.headers.get("x-admin-secret");
    if (provided !== secret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let userId: string | null = null;
  try {
    const body = await req.json().catch(() => ({})) as { userId?: string };
    userId = body.userId ?? null;
  } catch { /* body is optional */ }

  // Reset both the concurrent counter AND the video cooldown timestamp.
  // The cooldown check fires BEFORE the concurrent check — if video_cooldown_until
  // is still in the future, the request is blocked before the auto-heal can run.
  let query = supabaseAdmin
    .from("rate_limit_state")
    .update({ concurrent_video_jobs: 0, video_cooldown_until: null });

  if (userId) {
    query = (query as any).eq("user_id", userId);
  } else {
    query = (query as any).gte("concurrent_video_jobs", 0); // match all rows
  }

  const { data, error, count } = await (query as any).select("user_id, concurrent_video_jobs, video_cooldown_until");

  if (error) {
    console.error("[reset-video-slots] DB error:", error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const resetCount = Array.isArray(data) ? data.length : (count ?? 0);
  console.log(`[reset-video-slots] reset ${resetCount} row(s)${userId ? ` for user=${userId}` : " (all users)"}`);

  return Response.json({
    ok:      true,
    reset:   resetCount,
    userId:  userId ?? "all",
    rows:    data,
  });
}
