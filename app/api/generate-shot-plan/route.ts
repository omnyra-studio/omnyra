/**
 * POST /api/generate-shot-plan
 *
 * HTTP adapter for lib/orchestration/core/generate-shot-plan.ts.
 * Auth check + request parsing only — all logic lives in the core engine.
 *
 * Body: { scriptId?, scriptText?, projectId, platform, mode? }
 * Returns: { success, plan_id, shots, motion_map, meta }
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { generateShotPlan } from "@/lib/orchestration/core/generate-shot-plan";
import { ok, fail } from "@/lib/api/response";
import { withTrace } from "@/lib/api/autopsy";
import { getPostHogClient } from "@/lib/posthog-server";
import type { OrchestratorMode } from "@/lib/orchestration/types";

export const maxDuration = 120;

async function handler(request: Request): Promise<Response> {
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

  let body: {
    scriptId?:   string;
    scriptText?: string;
    projectId?:  string;
    platform?:   string;
    mode?:       OrchestratorMode;
  };
  try {
    body = await request.json();
  } catch {
    return fail("Invalid JSON body", 400, "PARSE_ERROR");
  }

  if (!body.projectId?.trim() || !body.platform?.trim()) {
    return fail("Missing required fields: projectId, platform", 400, "VALIDATION_ERROR");
  }
  if (!body.scriptId?.trim() && !body.scriptText?.trim()) {
    return fail("Missing required field: scriptId or scriptText", 400, "VALIDATION_ERROR");
  }

  try {
    const result = await generateShotPlan({
      supabase,
      userId:     user.id,
      scriptId:   body.scriptId,
      scriptText: body.scriptText,
      projectId:  body.projectId,
      platform:   body.platform,
      mode:       body.mode,
    });

    getPostHogClient().capture({
      distinctId: user.id,
      event:      "shot_plan_generated",
      properties: {
        plan_id:               result.planId,
        script_id:             result.scriptId,
        project_id:            body.projectId,
        platform:              body.platform,
        mode:                  result.meta.mode,
        shot_count:            result.meta.shot_count,
        total_duration_seconds: result.meta.total_duration,
        heygen_shots:          result.meta.avatar_shots,
        fal_shots:             result.meta.fal_shots,
        input_tokens:          result.meta.input_tokens,
        output_tokens:         result.meta.output_tokens,
      },
    });

    return ok({
      success:    true,
      plan_id:    result.planId,
      shots:      result.shots,
      motion_map: result.motionMap,
      meta:       result.meta,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.startsWith("Forbidden") ? 403 : msg.includes("not found") ? 404 : 500;
    console.error("[generate-shot-plan] error:", msg);
    return fail(msg, status);
  }
}

export const POST = withTrace(handler);
