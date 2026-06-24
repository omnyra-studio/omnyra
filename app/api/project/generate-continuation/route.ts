/**
 * POST /api/project/generate-continuation
 *
 * Loads the story memory + continuity snapshot from a previous render,
 * runs the Ghost EI Layer for continuation enhancement, then queues a new
 * cinematic generation using the same pipeline.
 *
 * The previous video's last clip URL acts as the first-frame anchor for
 * the next generation — full narrative and visual continuity maintained.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies }            from "next/headers";
import { supabaseAdmin }      from "@/lib/supabase/admin";
import { ghostEI }            from "@/lib/services/emotional-intelligence";

export const maxDuration = 30;

export async function POST(req: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase    = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: {
    previousVideoId?:  string;
    continuationIdea?: string;
    duration?:         number;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    previousVideoId,
    previousVideoUrl,
    continuationIdea = "",
    duration = 60,
  } = body as typeof body & { previousVideoUrl?: string };

  if (!previousVideoId && !previousVideoUrl) {
    return Response.json({ error: "previousVideoId or previousVideoUrl is required" }, { status: 400 });
  }

  // ── Load previous render (ownership check via user_id join) ───────────────
  const query = supabaseAdmin
    .from("renders")
    .select("id, user_id, project_id, story_memory, continuity_snapshot, video_url, niche");

  const { data: prevRender } = previousVideoId
    ? await query.eq("id", previousVideoId).single()
    : await query.eq("video_url", previousVideoUrl!).order("created_at", { ascending: false }).limit(1).single();

  if (!prevRender) {
    return Response.json({ error: "Previous video not found" }, { status: 404 });
  }
  if (prevRender.user_id !== user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Enhance continuation with Ghost EI Layer ──────────────────────────────
  const storyMemory = (prevRender.story_memory as Record<string, unknown> | null) ?? null;

  const enhancedScript = await ghostEI.enhanceContinuation(
    continuationIdea || "Continue the emotional story naturally with the same characters",
    storyMemory,
  );

  console.log(
    `[CONTINUATION] user=${user.id} prev=${previousVideoId} niche=${prevRender.niche} ` +
    `duration=${duration} enhanced=${enhancedScript.substring(0, 80)}`,
  );

  // ── Return payload for the client to trigger generate-cinematic-sequence ──
  // We don't call it directly here (it's too long-running for a 30s route).
  // The client should call /api/generate-cinematic-sequence with this payload.
  return Response.json({
    success:         true,
    projectId:       prevRender.project_id,
    enhancedScript,
    continuationPayload: {
      prompt:                  enhancedScript,
      niche:                   prevRender.niche ?? undefined,
      durationSeconds:         duration,
      previousVideoId,
      continuitySnapshot:      prevRender.continuity_snapshot ?? undefined,
      useStoryMemory:          true,
      isContinuation:          true,
      // Last clip of prev video becomes first-frame anchor for scene 1
      firstFrameAnchorUrl:     prevRender.video_url ?? undefined,
    },
  });
}
