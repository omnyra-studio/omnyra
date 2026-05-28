/**
 * POST /api/orchestrate-project
 *
 * HTTP adapter for lib/orchestration/core/orchestrate-project.ts.
 * Auth check + request parsing only — all logic lives in the core engine.
 *
 * Body: { mode, projectId?, scriptId?, scriptText?, platform? }
 * Returns: { project_id, plan_id, mode }
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { VALID_MODES } from "@/lib/orchestration/mode-adapters";
import { orchestrateProject } from "@/lib/orchestration/core/orchestrate-project";
import { getPostHogClient } from "@/lib/posthog-server";
import type { OrchestratorMode } from "@/lib/orchestration/types";

export const maxDuration = 120;

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

  let body: {
    mode?:        string;
    projectId?:   string;
    scriptId?:    string;
    scriptText?:  string;
    platform?:    string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mode = (body.mode ?? "general") as OrchestratorMode;
  if (!VALID_MODES.includes(mode)) {
    return NextResponse.json(
      { error: `Invalid mode "${mode}". Valid: ${VALID_MODES.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const result = await orchestrateProject({
      supabase,
      userId:     user.id,
      mode,
      projectId:  body.projectId,
      scriptId:   body.scriptId,
      scriptText: body.scriptText,
      platform:   body.platform,
    });

    getPostHogClient().capture({
      distinctId: user.id,
      event:      "project_orchestrated",
      properties: { mode, project_id: result.project_id, plan_id: result.plan_id },
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.startsWith("Forbidden") ? 403 : msg.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
