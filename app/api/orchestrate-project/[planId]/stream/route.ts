/**
 * GET /api/orchestrate-project/[planId]/stream
 *
 * Server-Sent Events stream for the orchestration pipeline.
 * On connect: backfills already-completed stages from DB.
 * Then subscribes to Supabase Realtime for ongoing updates.
 *
 * Emits: OrchestrationEvent (discriminated union — see lib/orchestration/events.ts)
 */

import { createServerClient } from "@supabase/ssr";
import { createClient }       from "@supabase/supabase-js";
import { cookies }            from "next/headers";
import { fail } from "@/lib/api/response";
import { sseEncode }          from "@/lib/orchestration/events";
import type { OrchestrationEvent } from "@/lib/orchestration/events";
import type { ShotPacket }         from "@/lib/types/shot";

export const dynamic     = "force-dynamic";
export const maxDuration = 300;

interface RouteContext { params: Promise<{ planId: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return fail("Unauthorized", 401);
  }

  const { planId } = await params;

  // ── Verify ownership ──────────────────────────────────────────────────────────
  const { data: plan } = await supabase
    .from("shot_plans")
    .select("id, projects!inner(user_id)")
    .eq("id", planId)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!plan || (plan as any).projects?.user_id !== user.id) {
    return fail("Not found", 404);
  }

  // Admin client — bypasses RLS for Realtime subscriptions
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const encoder = new TextEncoder();
  let ctrl: ReadableStreamDefaultController<Uint8Array> | null = null;

  function push(event: OrchestrationEvent) {
    try { ctrl?.enqueue(encoder.encode(sseEncode(event))); } catch { /* stream closed */ }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      ctrl = controller;

      // ── Backfill: replay already-completed stages ─────────────────────────────
      const [planResult, shotsResult, jobResult] = await Promise.all([
        admin.from("shot_plans")
          .select("id, voiceover_url, voiceover_status, scripts(id, content, platform, estimated_duration_seconds)")
          .eq("id", planId)
          .single(),
        admin.from("shots")
          .select("id, shot_id, shot_number, status, clip_url, narration_text, duration_seconds, start_time, end_time, content_type, render_assignment, fal_model, attention_function, energy_curve, camera_behavior, motion_intensity, framing, visual_prompt, transition_in, transition_after, transition_duration, audio_intent, fatigue_risk, avatar_motion, fal_render_params")
          .eq("shot_plan_id", planId)
          .order("shot_number", { ascending: true }),
        admin.from("render_jobs")
          .select("id, status, video_url")
          .eq("plan_id", planId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      // Script created
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const script = (planResult.data as any)?.scripts;
      if (script) {
        push({
          type: "SCRIPT_CREATED",
          payload: {
            id:                          script.id,
            content:                     script.content,
            platform:                    script.platform ?? "tiktok",
            estimated_duration_seconds:  script.estimated_duration_seconds ?? null,
          },
        });
      }

      // Shot plan created
      if (shotsResult.data?.length) {
        push({ type: "SHOT_PLAN_CREATED", payload: shotsResult.data as unknown as ShotPacket[] });
        for (const shot of shotsResult.data) {
          const shotId = (shot.shot_id ?? shot.id) as string;
          if (shot.status === "completed" && shot.clip_url) {
            push({ type: "SHOT_RENDERED", shotId, clipUrl: shot.clip_url as string });
          } else if (shot.status === "failed") {
            push({ type: "SHOT_FAILED", shotId, error: "Shot render failed" });
          }
        }
      }

      // Voiceover status
      const pData = planResult.data as { voiceover_url?: string; voiceover_status?: string } | null;
      if (pData?.voiceover_status === "generating") push({ type: "VOICEOVER_STARTED" });
      if (pData?.voiceover_url) push({ type: "VOICEOVER_READY", url: pData.voiceover_url });

      // Composition / completion
      const job = jobResult.data as { status: string; video_url?: string } | null;
      if (job?.status === "assembling") {
        push({ type: "COMPOSITION_STARTED" });
      } else if (job?.status === "completed" && job?.video_url) {
        push({ type: "COMPOSITION_STARTED" });
        push({ type: "PROJECT_COMPLETED", url: job.video_url });
      }

      // ── Realtime subscription ─────────────────────────────────────────────────
      const channel = admin.channel(`orch:${planId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "shots", filter: `shot_plan_id=eq.${planId}` },
          (payload) => {
            const row = payload.new as { shot_id?: string; id: string; status: string; clip_url?: string };
            const shotId = row.shot_id ?? row.id;
            if (row.status === "completed" && row.clip_url) {
              push({ type: "SHOT_RENDERED", shotId, clipUrl: row.clip_url });
            } else if (row.status === "failed") {
              push({ type: "SHOT_FAILED", shotId, error: "Shot render failed" });
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "shot_plans", filter: `id=eq.${planId}` },
          (payload) => {
            const next = payload.new as { voiceover_url?: string; voiceover_status?: string };
            const prev = payload.old as { voiceover_url?: string; voiceover_status?: string };
            if (next.voiceover_status === "generating" && prev.voiceover_status !== "generating") {
              push({ type: "VOICEOVER_STARTED" });
            }
            if (next.voiceover_url && !prev.voiceover_url) {
              push({ type: "VOICEOVER_READY", url: next.voiceover_url });
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "render_jobs", filter: `plan_id=eq.${planId}` },
          (payload) => {
            const row = payload.new as { status: string; video_url?: string };
            if (row.status === "assembling") push({ type: "COMPOSITION_STARTED" });
            else if (row.status === "completed" && row.video_url) {
              push({ type: "PROJECT_COMPLETED", url: row.video_url });
            }
          },
        )
        .subscribe();

      request.signal.addEventListener("abort", async () => {
        await channel.unsubscribe();
        await admin.removeChannel(channel);
        try { controller.close(); } catch { /* already closed */ }
        ctrl = null;
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
