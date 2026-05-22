/* POST /api/pipeline/render/[id]/approve
 *
 * User approves a `drafting` row → server transitions it to `rendering`
 * and kicks off the heavy pipeline in the background. Returns
 * immediately; client subscribes to render_events for progress.
 *
 * Background work uses Next.js `after()` so the response flushes before
 * the long-running pipeline runs. Vercel Fluid Compute keeps the
 * function instance alive across the response boundary.
 */

import { after } from "next/server";
import { getUserAndPlan } from "../../../../../../lib/auth";
import { supabaseAdmin } from "../../../../../../lib/supabase/admin";
import { runPipeline, emitEvent } from "../../../../../../lib/render-engine";
import { trackEvent } from "../../../../../../lib/events/trackEvent";
import {
  calculateRenderCost,
  loadTemplateMultiplier,
  TEMPLATE_DEFAULT_APIS,
} from "../../../../../../lib/credit-calculator";

export const maxDuration = 300;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteContext) {
  const { user } = await getUserAndPlan(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id: renderId } = await params;
  if (!renderId) {
    return Response.json({ error: "invalid_render_id" }, { status: 400 });
  }

  // Fetch + verify ownership
  const { data: render, error } = await supabaseAdmin
    .from("renders")
    .select("id, user_id, status, template, brief, scenes, script, director_settings, voice_id")
    .eq("id", renderId)
    .maybeSingle();

  if (error || !render) {
    return Response.json({ error: "render_not_found" }, { status: 404 });
  }
  if (render.user_id !== user.id) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  // Allowed transitions: drafting → rendering, OR failed → rendering (retry).
  if (render.status !== "drafting" && render.status !== "failed") {
    return Response.json(
      { error: "invalid_state", current_status: render.status },
      { status: 409 },
    );
  }

  if (!render.script || !Array.isArray(render.scenes) || render.scenes.length === 0) {
    return Response.json(
      { error: "draft_incomplete", message: "script + scenes required before approval" },
      { status: 409 },
    );
  }

  // Server-authoritative cost recomputation — never trust the client.
  const duration = Number(render.brief?.duration ?? 30);
  const template = String(render.template ?? "");
  const apisUsed = TEMPLATE_DEFAULT_APIS[template]
    ? Array.from(TEMPLATE_DEFAULT_APIS[template])
    : Array.from(new Set((render.scenes as Array<{ api?: string }>).map((s) => s.api).filter(Boolean) as string[]));

  const { data: creditRow } = await supabaseAdmin
    .from("credits")
    .select("balance")
    .eq("user_id", user.id)
    .single();
  const userCredits = creditRow?.balance ?? 0;

  const cost_multiplier = template ? await loadTemplateMultiplier(template) : 1.0;
  const cost = calculateRenderCost({
    template,
    duration,
    quality: "final",
    apis_used: apisUsed,
    scenes: render.scenes.length,
    userCredits,
    cost_multiplier,
  });

  if (!cost.sufficient_credits) {
    return Response.json(
      { error: "insufficient_credits", balance: userCredits, required: cost.final_cost },
      { status: 402 },
    );
  }

  const voiceId = render.voice_id || process.env.DEFAULT_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

  // Transition drafting → rendering. DB truth changes before background work.
  await supabaseAdmin
    .from("renders")
    .update({
      status: "rendering",
      approved_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("id", renderId);

  await emitEvent(renderId, "render_created", {
    stage: "rendering_started",
    estimated_credits: cost.final_cost,
  });
  await trackEvent(user.id, "render_requested", {
    render_id: renderId,
    template,
    estimated_credits: cost.final_cost,
  });

  // Defer heavy work until after the response is sent. The pipeline is
  // idempotent — safe even if the function gets re-invoked.
  after(async () => {
    await runPipeline({
      renderId,
      userId: user.id,
      script: render.script,
      scenes: render.scenes,
      voiceId,
      creditsRequired: cost.final_cost,
    });
  });

  return Response.json({
    render_id: renderId,
    status: "rendering",
    estimated_credits: cost.final_cost,
  });
}
