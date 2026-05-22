/* GET /api/renders/[id]/loop-suggestions
 *
 * AGS §8 — post-render growth-loop suggestions. The client renders
 * three CTAs after a video completes:
 *
 *   1. Create variation       — same brief, alternate hook style
 *   2. Turn into series       — three-render batch with sequenced briefs
 *   3. Remix trending template— top-velocity template from the feed
 *
 * This endpoint returns the SERVER-COMPUTED data for those CTAs so the
 * client does not have to hold any business logic. Auth required.
 */

import { getUserAndPlan } from "../../../../../lib/auth";
import { supabaseAdmin } from "../../../../../lib/supabase/admin";
import { getTrendingTemplates } from "../../../../../lib/optimization/templates";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const ALT_HOOK_STYLES: Record<string, string> = {
  question_hook: "shock_hook",
  shock_hook: "story_hook",
  story_hook: "question_hook",
  founder: "shock_hook",
  ugc: "founder",
};

interface RenderRow {
  user_id: string;
  template: string | null;
  brief: { product?: string; audience?: string; platform?: string; goal?: string; duration?: number } | null;
  director_settings: { energy?: string; camera?: string; style?: string } | null;
  status: string;
}

export async function GET(request: Request, { params }: RouteContext) {
  const { user } = await getUserAndPlan(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id: renderId } = await params;
  if (!renderId) return Response.json({ error: "invalid_render_id" }, { status: 400 });

  const { data: row, error } = await supabaseAdmin
    .from("renders")
    .select("user_id, template, brief, director_settings, status")
    .eq("id", renderId)
    .maybeSingle();
  if (error || !row) return Response.json({ error: "render_not_found" }, { status: 404 });

  const render = row as RenderRow;
  if (render.user_id !== user.id) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (render.status !== "complete") {
    return Response.json({ error: "render_not_complete", status: render.status }, { status: 409 });
  }

  const brief = render.brief ?? {};
  const director = render.director_settings ?? {};
  const currentStyle = (director.style ?? "founder").toLowerCase();
  const alternateStyle = ALT_HOOK_STYLES[currentStyle] ?? "shock_hook";

  // ── 1. Variation: same brief, alternate style ─────────────────
  const variation = {
    label: "Create variation",
    brief,
    director_settings: { ...director, style: alternateStyle },
    template: render.template,
    rationale: `alternate style: ${currentStyle} → ${alternateStyle}`,
  };

  // ── 2. Series: three-render batch with sequenced briefs ───────
  const baseProduct = brief.product ?? "";
  const series = {
    label: "Turn into series (3 videos)",
    template: render.template,
    director_settings: director,
    items: [
      { brief: { ...brief, product: baseProduct, goal: brief.goal }, position: 1, hook_focus: "problem_setup" },
      { brief: { ...brief, product: baseProduct, goal: brief.goal }, position: 2, hook_focus: "demonstration" },
      { brief: { ...brief, product: baseProduct, goal: brief.goal }, position: 3, hook_focus: "social_proof" },
    ],
    rationale: "three-part narrative arc",
  };

  // ── 3. Remix: top-velocity template ───────────────────────────
  const trending = await getTrendingTemplates(5);
  const remixCandidate = trending.find((t) => t.template !== render.template) ?? trending[0];
  const remix = remixCandidate
    ? {
        label: "Remix trending template",
        template: remixCandidate.template,
        director_settings: director,
        brief,
        trending_score: remixCandidate.hook_performance_score,
        rationale: `trending #1 → ${remixCandidate.template}`,
      }
    : null;

  return Response.json({
    render_id: renderId,
    suggestions: { variation, series, remix },
  });
}
