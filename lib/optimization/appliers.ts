/* AGS appliers — close the loop on system_insights recommendations.
 *
 * Safety policy (per spec governor):
 *   SAFE actions auto-apply (fully reversible, no billing impact):
 *     - promote_template       → template_settings.recommended=true,
 *                                display_order moved up
 *     - soft_hide_template     → template_settings.visible=false
 *
 *   GATED actions require OMNYRA_AGS_AUTO_APPLY=true (billing/UX impact):
 *     - flag_churn_risk            → grants intervention credits
 *     - grant_retention_credits    → inserts credit_transactions
 *     - suggest_pricing_adjustment → mutates template cost_multiplier
 *     - reduce_onboarding_friction → noop until product owner defines
 *                                    the concrete friction reduction
 *
 * Every applied insight is marked `applied_at = now()` so the same
 * recommendation does not fire twice.
 */

import { supabaseAdmin } from "../supabase/admin";
import { markInsightApplied, autoApplyEnabled, type RecommendationAction } from "./insights";

const RETENTION_BONUS_CREDITS = 25;
const PRICING_STEP = 0.05; // 5% per adjustment

interface InsightRow {
  id: string;
  recommendation_action: RecommendationAction | null;
}

async function pendingInsights(limit: number = 200): Promise<InsightRow[]> {
  const { data } = await supabaseAdmin
    .from("system_insights")
    .select("id, recommendation_action")
    .is("applied_at", null)
    .order("impact_score", { ascending: false })
    .limit(limit);
  return (data as InsightRow[] | null) ?? [];
}

async function promoteTemplate(template: string, insightId: string): Promise<void> {
  // display_order: pick the current minimum visible order, then subtract
  // 10 so the promoted template sorts to the top.
  const { data: top } = await supabaseAdmin
    .from("template_settings")
    .select("display_order")
    .not("display_order", "is", null)
    .order("display_order", { ascending: true })
    .limit(1);
  const minOrder = top && top[0]?.display_order != null ? Number(top[0].display_order) : 0;

  await supabaseAdmin.from("template_settings").upsert(
    {
      template,
      visible: true,
      recommended: true,
      display_order: minOrder - 10,
      last_change_reason: insightId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "template" },
  );
}

async function softHideTemplate(template: string, insightId: string): Promise<void> {
  await supabaseAdmin.from("template_settings").upsert(
    {
      template,
      visible: false,
      recommended: false,
      last_change_reason: insightId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "template" },
  );
}

async function grantRetentionCredits(
  userId: string,
  insightId: string,
  amount: number = RETENTION_BONUS_CREDITS,
): Promise<void> {
  await supabaseAdmin.from("credit_transactions").insert({
    user_id: userId,
    amount,
    type: "retention_bonus",
    description: `AGS retention intervention (insight=${insightId})`,
  });
}

async function adjustPricing(
  template: string,
  direction: "up" | "down",
  pct: number,
  insightId: string,
): Promise<void> {
  const { data: row } = await supabaseAdmin
    .from("template_settings")
    .select("cost_multiplier")
    .eq("template", template)
    .maybeSingle();

  const current = Number(row?.cost_multiplier ?? 1.0);
  const delta = (direction === "up" ? +1 : -1) * (Number.isFinite(pct) ? pct : PRICING_STEP);
  // Step is bounded; the calculator also clamps at call time as a
  // defense-in-depth measure.
  const next = Math.max(0.5, Math.min(2.0, current + delta));

  await supabaseAdmin.from("template_settings").upsert(
    {
      template,
      cost_multiplier: next,
      last_change_reason: insightId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "template" },
  );
}

export interface ApplyResult {
  considered: number;
  applied: number;
  skipped_gated: number;
  errors: number;
  actions: Record<string, number>;
}

export async function applyPendingInsights(): Promise<ApplyResult> {
  const insights = await pendingInsights();
  const armed = autoApplyEnabled();

  const result: ApplyResult = {
    considered: insights.length,
    applied: 0,
    skipped_gated: 0,
    errors: 0,
    actions: {},
  };

  for (const ins of insights) {
    const action = ins.recommendation_action ?? { type: "none" };
    if (action.type === "none") continue;

    const tally = (key: string) => {
      result.actions[key] = (result.actions[key] ?? 0) + 1;
    };

    try {
      switch (action.type) {
        // ── Safe (always auto-apply) ────────────────────────────────
        case "promote_template": {
          await promoteTemplate(action.template, ins.id);
          await markInsightApplied(ins.id, "ags:safe");
          result.applied += 1;
          tally("promote_template");
          break;
        }
        case "soft_hide_template": {
          await softHideTemplate(action.template, ins.id);
          await markInsightApplied(ins.id, "ags:safe");
          result.applied += 1;
          tally("soft_hide_template");
          break;
        }

        // ── Gated (require OMNYRA_AGS_AUTO_APPLY=true) ──────────────
        case "grant_retention_credits": {
          if (!armed) { result.skipped_gated += 1; tally("grant_retention_credits:gated"); break; }
          await grantRetentionCredits(action.user_id, ins.id, action.amount);
          await markInsightApplied(ins.id, "ags:armed");
          result.applied += 1;
          tally("grant_retention_credits");
          break;
        }
        case "flag_churn_risk": {
          // Flagging itself is already persisted by the churn detector
          // into user_profiles_extended. The "action" here is granting
          // retention credits to high-risk users, but only when armed.
          if (!armed) { result.skipped_gated += 1; tally("flag_churn_risk:gated"); break; }
          await grantRetentionCredits(action.user_id, ins.id);
          await markInsightApplied(ins.id, "ags:armed");
          result.applied += 1;
          tally("flag_churn_risk");
          break;
        }
        case "suggest_pricing_adjustment": {
          if (!armed) { result.skipped_gated += 1; tally("suggest_pricing_adjustment:gated"); break; }
          // The insight needs to be scoped to a specific template; if
          // not, we skip rather than guess.
          const template = (ins as unknown as { context?: { template?: string } }).context?.template;
          if (!template) { result.skipped_gated += 1; break; }
          await adjustPricing(template, action.direction, action.pct, ins.id);
          await markInsightApplied(ins.id, "ags:armed");
          result.applied += 1;
          tally("suggest_pricing_adjustment");
          break;
        }

        // ── Manual review required ──────────────────────────────────
        case "reduce_onboarding_friction": {
          // Onboarding changes can degrade UX abruptly — require a
          // product owner to define the concrete change. We leave the
          // insight pending so it remains visible in dashboards.
          result.skipped_gated += 1;
          tally("reduce_onboarding_friction:manual");
          break;
        }
      }
    } catch (err) {
      console.error(`[appliers] insight=${ins.id} failed:`, err);
      result.errors += 1;
    }
  }

  return result;
}
