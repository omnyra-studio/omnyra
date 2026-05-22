/* POST /api/pipeline/render
 *
 * The ONLY entry point for the render pipeline.
 *
 * 1. Validates the brief + director settings.
 * 2. Inserts a `renders` row with status='queued' (DB truth before any work).
 * 3. Emits `brief_submitted` to the global events stream.
 * 4. Generates the script + scenes synchronously (cheap, ~5s).
 * 5. Transitions row to status='drafting' and emits `draft_generated`.
 * 6. Returns { render_id, status: 'drafting' }.
 *
 * The heavy pipeline (voice → motion → lipsync) runs only after the
 * client approves: POST /api/pipeline/render/[id]/approve.
 *
 * Client must subscribe to render_events (NOT renders) for granular UI.
 */

import { getUserAndPlan } from "../../../../lib/auth";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { guardPipelineRequest } from "../../../../lib/api-guard";
import { generateScriptAndScenes } from "../../../../lib/script-engine";
import { emitEvent } from "../../../../lib/render-engine";
import { trackEvent } from "../../../../lib/events/trackEvent";
import { calculateRenderCost, loadTemplateMultiplier } from "../../../../lib/credit-calculator";
import { predictViralScore } from "../../../../lib/optimization/personalization";

export const maxDuration = 60;

interface DirectorSettings {
  energy?: string | null;
  camera?: string | null;
  style?: string | null;
}

interface Brief {
  product?: string;
  audience?: string;
  platform?: string;
  goal?: string;
  duration?: number;
}

interface CreateRenderBody {
  template?: string;
  brief?: Brief;
  director_settings?: DirectorSettings;
  voice_id?: string;
}

export async function POST(request: Request) {
  const { user } = await getUserAndPlan(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const guarded = await guardPipelineRequest<CreateRenderBody>({
    userId: user.id,
    endpoint: "/api/pipeline/render",
    request,
  });
  if (guarded.ok !== true) {
    const fail = guarded as { ok: false; status: number; body: { error: string } };
    return Response.json(fail.body, { status: fail.status });
  }

  const body: CreateRenderBody = guarded.payload ?? {};
  const template = (body.template ?? "").trim();
  const brief = body.brief ?? {};
  const director = body.director_settings ?? {};
  const voiceId = (body.voice_id ?? "").trim();

  if (!brief.product?.trim() || !brief.audience?.trim() || !brief.platform || !brief.goal || !brief.duration) {
    return Response.json(
      { error: "invalid_brief", message: "product, audience, platform, goal, duration required" },
      { status: 400 },
    );
  }

  // Server-authoritative cost — client cannot spoof
  const duration = Number(brief.duration);
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
    apis_used: [],
    userCredits,
    cost_multiplier,
  });

  if (!cost.sufficient_credits) {
    return Response.json(
      { error: "insufficient_credits", balance: userCredits, required: cost.final_cost },
      { status: 402 },
    );
  }

  // 1. Insert render row at status='queued' (DB truth before any work).
  const { data: render, error: insertErr } = await supabaseAdmin
    .from("renders")
    .insert({
      user_id: user.id,
      template,
      brief,
      director_settings: director,
      voice_id: voiceId || null,
      status: "queued",
    })
    .select("id")
    .single();

  if (insertErr || !render) {
    console.error("[render] insert failed", insertErr);
    return Response.json({ error: "create_failed" }, { status: 500 });
  }

  const renderId: string = render.id;

  await emitEvent(renderId, "render_created", {
    template,
    user_id: user.id,
    estimated_credits: cost.final_cost,
  });
  await emitEvent(renderId, "brief_validated", { brief, director });

  // Global event: user submitted a brief. This is the "intent to create"
  // signal used by the funnel and the optimisation engine.
  await trackEvent(user.id, "brief_submitted", {
    render_id: renderId,
    template,
    duration,
    platform: brief.platform,
    goal: brief.goal,
    energy: director.energy ?? null,
    camera: director.camera ?? null,
    style: director.style ?? null,
    estimated_credits: cost.final_cost,
  });
  // Compatibility: spec lists both brief_created and brief_submitted.
  await trackEvent(user.id, "brief_created", {
    render_id: renderId,
    template,
  });

  // 2. Generate script (synchronous, cheap) — transitions queued → drafting.
  try {
    const { script, scenes } = await generateScriptAndScenes({
      product: brief.product,
      audience: brief.audience,
      platform: brief.platform,
      goal: brief.goal,
      duration,
      energy: director.energy ?? null,
      camera: director.camera ?? null,
      style: director.style ?? null,
    });

    await supabaseAdmin
      .from("renders")
      .update({
        script,
        scenes,
        status: "drafting",
        updated_at: new Date().toISOString(),
      })
      .eq("id", renderId);

    await emitEvent(renderId, "script_generated", {
      length: script.length,
      scene_count: scenes.length,
    });
    await trackEvent(user.id, "draft_generated", {
      render_id: renderId,
      template,
      scene_count: scenes.length,
    });

    // AGS §5 — predict viral potential BEFORE rendering. The client
    // uses high_potential=true to surface an earlier share CTA and
    // "high potential" badge on the draft preview.
    const prediction = await predictViralScore({
      user_id: user.id,
      template,
      audience: brief.audience ?? null,
    });
    await trackEvent(user.id, "draft_generated", {
      render_id: renderId,
      predicted_viral_score: prediction.predicted_viral_score,
      components: prediction.components,
    });
    await supabaseAdmin
      .from("renders")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", renderId);

    return Response.json({
      render_id: renderId,
      status: "drafting",
      estimated_credits: cost.final_cost,
      predicted_viral_score: prediction.predicted_viral_score,
      high_potential: prediction.predicted_viral_score >= 75,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[render] script gen failed:", msg);
    await supabaseAdmin
      .from("renders")
      .update({ status: "failed", error_message: msg })
      .eq("id", renderId);
    await emitEvent(renderId, "render_failed", { message: msg, stage: "script" });
    await trackEvent(user.id, "render_failed", {
      render_id: renderId,
      stage: "script",
      message: msg,
    });
    return Response.json(
      { render_id: renderId, error: "script_generation_failed", message: msg },
      { status: 500 },
    );
  }
}
