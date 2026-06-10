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
  // Fail-closed: if ADMIN_SECRET is not configured, block all requests.
  // The previous if(secret){} pattern allowed bypass when the env var was unset.
  const secret   = process.env.ADMIN_SECRET;
  const provided = req.headers.get("x-admin-secret");
  if (!secret || !provided || provided !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let userId: string | null = null;
  try {
    const body = await req.json().catch(() => ({})) as { userId?: string };
    userId = body.userId ?? null;
  } catch { /* body is optional */ }

  const resetPayload = {
    concurrent_video_jobs: 0,
    video_cooldown_until:  null,
    updated_at:            new Date().toISOString(),
  };

  let data: unknown[] = [];
  let error: { message: string } | null = null;

  if (userId) {
    // Upsert a specific user — creates the row if missing, guaranteeing clean DB state
    // even when the in-process cache has stale values (cache TTL = 5s now).
    const res = await supabaseAdmin
      .from("rate_limit_state")
      .upsert({ user_id: userId, ...resetPayload }, { onConflict: "user_id" })
      .select("user_id, concurrent_video_jobs, video_cooldown_until");
    data  = (res.data as unknown[]) ?? [];
    error = res.error as { message: string } | null;
  } else {
    // Update ALL rows
    const res = await supabaseAdmin
      .from("rate_limit_state")
      .update(resetPayload)
      .gte("id", "00000000-0000-0000-0000-000000000000") // match all rows
      .select("user_id, concurrent_video_jobs, video_cooldown_until");
    data  = (res.data as unknown[]) ?? [];
    error = res.error as { message: string } | null;
  }

  if (error) {
    console.error("[reset-video-slots] DB error:", error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const resetCount = Array.isArray(data) ? data.length : 0;
  console.log(`[reset-video-slots] reset ${resetCount} row(s)${userId ? ` for user=${userId}` : " (all users)"}`);

  return Response.json({
    ok:      true,
    reset:   resetCount,
    userId:  userId ?? "all",
    rows:    data,
  });
}
