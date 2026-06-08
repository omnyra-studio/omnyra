// POST /api/parallel-render
//
// HTTP endpoint that triggers the parallel orchestration engine for a shot plan.
// Auth → credit reservation → fire engine (non-blocking) → return immediately.
//
// Body:    { planId: string, characterId?: string, draftMode?: boolean }
// Returns: { planId, status: 'started', hedra_count, kling_count }
//
// Progress: stream via GET /api/render-progress?planId=xxx (SSE)
// Final video: assembled by compose-video route after engine completes.

import { createServerClient } from "@supabase/ssr";
import { cookies }            from "next/headers";
import { NextResponse }       from "next/server";
import { runParallelEngine }  from "@/lib/orchestrator/parallel-engine";
import { supabaseAdmin }      from "@/lib/supabase/admin";

function emitRaw(type: string, correlationId: string, payload: Record<string, unknown>): void {
  void supabaseAdmin.from("orchestration_events")
    .insert({ type, correlation_id: correlationId, payload });
}

export const maxDuration = 300;

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase    = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    planId?:             string;
    characterId?:        string;
    characterIds?:       string[];
    draftMode?:          boolean;
    speedMode?:          'ultra-draft' | 'draft' | 'balanced' | 'quality';
    targetDurationSecs?: number;
    skipStitch?:         boolean;
    fullScript?:         string;
    voiceId?:            string;
    maxClips?:           number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    planId,
    characterId,
    characterIds,
    draftMode = false,
    speedMode,
    targetDurationSecs = 30,
    skipStitch = false,
    fullScript,
    voiceId,
    maxClips = 3,
  } = body;

  // Propagation check — log exactly what arrived so truncation is traceable
  console.info("[parallel-render] received", {
    planId,
    fullScript_len:   fullScript?.length  ?? "MISSING",
    fullScript_words: fullScript?.split(" ").length ?? "MISSING",
    targetDurationSecs,
    characterIds:     characterIds?.length ?? characterId ? 1 : 0,
  });

  if (!planId?.trim()) {
    return NextResponse.json({ error: "Missing required field: planId" }, { status: 400 });
  }

  // Verify plan belongs to this user
  const { data: plan } = await supabase
    .from("shot_plans")
    .select("id, scripts!inner(user_id)")
    .eq("id", planId)
    .maybeSingle();

  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  // Count shots to estimate credit cost before reserving
  const { data: shots, error: shotsErr } = await supabase
    .from("shots")
    .select("id, render_assignment, duration_seconds")
    .eq("shot_plan_id", planId);

  if (shotsErr || !shots?.length) {
    return NextResponse.json({ error: "No shots found for plan" }, { status: 404 });
  }

  const avatarShots = shots.filter(s => s.render_assignment === "avatar");
  const klingShots  = shots.filter(s => s.render_assignment === "fal");

  // Signal start immediately
  emitRaw("PARALLEL_ENGINE_QUEUED", planId, {
    planId,
    hedra_count: avatarShots.length,
    kling_count: klingShots.length,
    draft_mode:  draftMode,
  });

  // Run engine within the request lifecycle (Vercel Fluid Compute, maxDuration=300s)
  runParallelEngine({
    planId,
    userId:              user.id,
    characterId:         characterId ?? undefined,
    characterIds:        characterIds ?? undefined,
    draftMode,
    speedMode:           speedMode   ?? undefined,
    targetDurationSecs,
    skipStitch,
    fullScript:          fullScript  ?? undefined,
    voiceId:             voiceId     ?? undefined,
    maxClips,
  }).catch(err => {
    console.error("[parallel-render] engine error:", err);
    emitRaw("PARALLEL_ENGINE_FAILED", planId, { error: err instanceof Error ? err.message : String(err) });
  });

  return NextResponse.json({
    planId,
    status:               "started",
    hedra_count:          avatarShots.length,
    kling_count:          klingShots.length,
    draft_mode:           draftMode,
    target_duration_secs: targetDurationSecs,
    character_count:      (characterIds ?? (characterId ? [characterId] : [])).length,
    progress_url:         `/api/render-progress?planId=${planId}`,
  });
}
