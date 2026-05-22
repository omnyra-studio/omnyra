/* GET /api/create/defaults
 *
 * AGS §6 — auto-fill payload for the /create page. Reads the user's
 * personalisation row and returns "best for you" defaults so the brief
 * composer can pre-select template, audience, energy, camera, style.
 *
 * Priority order for the suggested template:
 *   1. user_profiles_extended.suggested_template
 *      (set by the churn applier — overrides everything because the
 *      AGS has explicitly intervened to reduce friction)
 *   2. success_pattern.best_template (highest avg viral_score, ≥2 renders)
 *   3. dominant_template_type (most-used template)
 *   4. null → client falls back to trending feed or hard-coded default
 *
 * Auth required.
 */

import { getUserAndPlan } from "../../../../lib/auth";
import { supabaseAdmin } from "../../../../lib/supabase/admin";

export const dynamic = "force-dynamic";

interface ProfileRow {
  dominant_template_type: string | null;
  audience_type: string | null;
  preferred_energy_level: string | null;
  avg_hook_style: string | null;
  success_pattern: { best_template?: string | null } | null;
  conversion_behavior: Record<string, unknown> | null;
  churn_risk_score: number | null;
  suggested_template: string | null;
  onboarding_minimal: boolean | null;
  premium_unlocked_until: string | null;
}

export async function GET(request: Request) {
  const { user } = await getUserAndPlan(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabaseAdmin
    .from("user_profiles_extended")
    .select(
      "dominant_template_type, audience_type, preferred_energy_level, avg_hook_style, success_pattern, conversion_behavior, churn_risk_score, suggested_template, onboarding_minimal, premium_unlocked_until",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const p = (data as ProfileRow | null) ?? null;

  // Resolve the template suggestion through the priority cascade.
  const suggested_template =
    p?.suggested_template
    ?? p?.success_pattern?.best_template
    ?? p?.dominant_template_type
    ?? null;

  const reason = p?.suggested_template
    ? "churn_intervention"
    : p?.success_pattern?.best_template
    ? "best_performing"
    : p?.dominant_template_type
    ? "most_used"
    : "cold_start";

  const now = Date.now();
  const premium_unlocked = p?.premium_unlocked_until
    ? new Date(p.premium_unlocked_until).getTime() > now
    : false;

  return Response.json({
    has_profile: Boolean(p),
    defaults: {
      template: suggested_template,
      audience: p?.audience_type ?? null,
      energy: p?.preferred_energy_level ?? null,
      style: p?.avg_hook_style ?? null,
    },
    reason,
    signals: {
      churn_risk_score: p?.churn_risk_score ?? 0,
      conversion_behavior: p?.conversion_behavior ?? {},
    },
    // AGS §7 — client uses this to skip optional onboarding screens.
    onboarding_minimal: Boolean(p?.onboarding_minimal),
    // AGS §8 — client uses this to surface premium templates to
    // share-rewarded users without changing their plan.
    premium_unlocked,
    premium_unlocked_until: p?.premium_unlocked_until ?? null,
  });
}
