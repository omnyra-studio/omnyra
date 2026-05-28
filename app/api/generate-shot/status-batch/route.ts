/**
 * POST /api/generate-shot/status-batch
 *
 * Checks fal.ai queue status for multiple shots in one round-trip.
 * Called by the director page every 5s while shots are processing.
 *
 * Body:    { shotDbIds: string[] }   — Supabase UUIDs from shots.id
 * Returns: { shots: ShotStatus[] }
 *
 * ShotStatus: { id, shot_id, shot_number, status, clip_url?, error? }
 *   status: "completed" | "failed" | "processing" | "pending"
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { extractVideoUrl } from "@/lib/shot-executor";

fal.config({ credentials: process.env.FAL_API_KEY });

interface ShotStatus {
  id: string;
  shot_id: string;
  shot_number: number;
  status: "completed" | "failed" | "processing" | "pending";
  clip_url?: string;
  error?: string;
}

export async function POST(request: Request) {
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

  let body: { shotDbIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { shotDbIds } = body;
  if (!Array.isArray(shotDbIds) || shotDbIds.length === 0) {
    return NextResponse.json({ error: "Missing shotDbIds array" }, { status: 400 });
  }

  // Load all requested shots in one query
  const { data: shots, error: shotsErr } = await supabase
    .from("shots")
    .select("id, shot_id, shot_number, render_status, clip_url, render_error, fal_request_id, fal_model, shot_plans!inner(project_id, projects!inner(user_id))")
    .in("id", shotDbIds);

  if (shotsErr || !shots) {
    return NextResponse.json({ error: "Failed to load shots" }, { status: 500 });
  }

  // Filter to only the caller's shots
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userShots = shots.filter(s => (s as any).shot_plans?.projects?.user_id === user.id);

  // Check each shot — run fal status checks in parallel
  const results: ShotStatus[] = await Promise.all(
    userShots.map(async (shot): Promise<ShotStatus> => {
      const base = {
        id: shot.id as string,
        shot_id: shot.shot_id as string,
        shot_number: shot.shot_number as number,
      };

      // Already in terminal state — return immediately
      if (shot.render_status === "completed") {
        return { ...base, status: "completed", clip_url: shot.clip_url as string };
      }
      if (shot.render_status === "failed") {
        return { ...base, status: "failed", error: shot.render_error as string ?? "Unknown error" };
      }

      // Not yet submitted to fal
      if (!shot.fal_request_id || !shot.fal_model) {
        return { ...base, status: "pending" };
      }

      // Check fal queue status
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const falStatus = await (fal as any).queue.status(shot.fal_model, {
          requestId: shot.fal_request_id,
          logs: false,
        }) as { status: string; error?: { message?: string } };

        if (falStatus?.status === "COMPLETED") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await (fal as any).queue.result(shot.fal_model, {
            requestId: shot.fal_request_id,
          });
          const videoUrl = extractVideoUrl(result);

          if (videoUrl) {
            await supabase
              .from("shots")
              .update({ clip_url: videoUrl, render_status: "completed", render_error: null })
              .eq("id", shot.id);
            return { ...base, status: "completed", clip_url: videoUrl };
          }

          const errMsg = "No video URL in fal result";
          await supabase
            .from("shots")
            .update({ render_status: "failed", render_error: errMsg })
            .eq("id", shot.id);
          return { ...base, status: "failed", error: errMsg };
        }

        if (falStatus?.status === "FAILED") {
          const errMsg = falStatus?.error?.message ?? "fal render failed";
          await supabase
            .from("shots")
            .update({ render_status: "failed", render_error: errMsg })
            .eq("id", shot.id);
          return { ...base, status: "failed", error: errMsg };
        }

        // IN_QUEUE or IN_PROGRESS
        return { ...base, status: "processing" };
      } catch (err) {
        console.error(`[status-batch] fal status check failed for shot ${shot.shot_id}:`, err);
        return { ...base, status: "processing" };
      }
    }),
  );

  return NextResponse.json({ shots: results });
}
