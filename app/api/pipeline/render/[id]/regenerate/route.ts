/* POST /api/pipeline/render/[id]/regenerate
 *
 * Re-runs script generation for a draft. Only valid while the render
 * is in `drafting` or `failed` state (i.e. before/after approval but
 * not while actively rendering).
 *
 * Emits `video_regenerated` to the global events stream so the
 * regenerate rate (a key UX signal) is queryable.
 */

import { getUserAndPlan } from "../../../../../../lib/auth";
import { supabaseAdmin } from "../../../../../../lib/supabase/admin";
import { generateScriptAndScenes } from "../../../../../../lib/script-engine";
import { emitEvent } from "../../../../../../lib/render-engine";
import { trackEvent } from "../../../../../../lib/events/trackEvent";

export const maxDuration = 60;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteContext) {
  const { user } = await getUserAndPlan(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id: renderId } = await params;
  if (!renderId) return Response.json({ error: "invalid_render_id" }, { status: 400 });

  const { data: render, error } = await supabaseAdmin
    .from("renders")
    .select("id, user_id, status, template, brief, director_settings")
    .eq("id", renderId)
    .maybeSingle();

  if (error || !render) {
    return Response.json({ error: "render_not_found" }, { status: 404 });
  }
  if (render.user_id !== user.id) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (render.status !== "drafting" && render.status !== "failed") {
    return Response.json(
      { error: "invalid_state", current_status: render.status },
      { status: 409 },
    );
  }

  const brief = render.brief ?? {};
  const director = render.director_settings ?? {};

  if (!brief.product || !brief.audience || !brief.platform || !brief.goal || !brief.duration) {
    return Response.json({ error: "incomplete_brief" }, { status: 400 });
  }

  try {
    const { script, scenes } = await generateScriptAndScenes({
      product: brief.product,
      audience: brief.audience,
      platform: brief.platform,
      goal: brief.goal,
      duration: Number(brief.duration),
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
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", renderId);

    await emitEvent(renderId, "script_generated", {
      length: script.length,
      scene_count: scenes.length,
      regenerated: true,
    });
    await trackEvent(user.id, "video_regenerated", {
      render_id: renderId,
      template: render.template,
      scene_count: scenes.length,
    });

    return Response.json({ render_id: renderId, status: "drafting" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabaseAdmin
      .from("renders")
      .update({ status: "failed", error_message: msg })
      .eq("id", renderId);
    await emitEvent(renderId, "render_failed", { message: msg, stage: "regenerate" });
    await trackEvent(user.id, "render_failed", {
      render_id: renderId,
      stage: "regenerate",
      message: msg,
    });
    return Response.json(
      { render_id: renderId, error: "regeneration_failed", message: msg },
      { status: 500 },
    );
  }
}
