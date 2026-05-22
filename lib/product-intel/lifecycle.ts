/* Feature lifecycle state machine.
 *
 * Each node in product_behavior_graph has a current lifecycle stage in
 * feature_current_stage. The transitions follow the spec:
 *
 *   emerging → active → dominant → decaying → deprecated
 *
 * Rules:
 *   - First-ever observation               → emerging
 *   - Steady usage with health_score ≥ 50  → active
 *   - High usage + high health (≥ 75)      → dominant
 *   - usage drop AND dropoff_rate high     → decaying
 *   - decaying for ≥ 14 days               → deprecated
 *
 * Spec §6 auto-removal rules are honoured: nothing is deleted; the
 * deprecated stage just hides the node from default UI.
 */

import { supabaseAdmin } from "../supabase/admin";

const DAY_MS = 24 * 60 * 60 * 1000;
const DOMINANT_HEALTH = 75;
const ACTIVE_HEALTH = 50;
const DECAYING_DROPOFF = 0.4;
const DECAYING_USAGE_FLOOR = 5;        // % usage share threshold
const DEPRECATION_DAYS = 14;

interface GraphNode {
  node_id: string;
  usage_count: number;
  dropoff_rate: number;
  health_score: number;
}

interface StageRow { node_id: string; stage: string; entered_at: string }

async function recordTransition(
  node_id: string,
  stage: string,
  reason: string,
  source_metrics: Record<string, unknown>,
): Promise<void> {
  await supabaseAdmin.from("feature_lifecycle").insert({
    node_id, stage, reason, source_metrics,
  });
}

export interface LifecycleResult {
  nodes_evaluated: number;
  transitions: Record<string, number>;
}

export async function recomputeFeatureLifecycle(): Promise<LifecycleResult> {
  const { data: rows } = await supabaseAdmin
    .from("product_behavior_graph")
    .select("node_id, node_type, usage_count, dropoff_rate, health_score");
  const nodes = ((rows ?? []) as Array<GraphNode & { node_type: string }>).filter(
    (n) => n.node_type === "feature" || n.node_type === "flow",
  );

  const { data: currentRows } = await supabaseAdmin
    .from("feature_current_stage")
    .select("node_id, stage, entered_at");
  const current = new Map<string, StageRow>(
    ((currentRows ?? []) as StageRow[]).map((r) => [r.node_id, r]),
  );

  const totalUsage = nodes.reduce((s, n) => s + Number(n.usage_count ?? 0), 0) || 1;
  const transitions: Record<string, number> = {};
  const tally = (k: string) => { transitions[k] = (transitions[k] ?? 0) + 1; };

  for (const n of nodes) {
    const usageShare = (Number(n.usage_count) / totalUsage) * 100;
    const health = Number(n.health_score);
    const dropoff = Number(n.dropoff_rate);
    const prev = current.get(n.node_id);

    let nextStage: string;
    let reason: string;

    if (!prev) {
      nextStage = "emerging";
      reason = "first_observation";
    } else if (prev.stage === "deprecated") {
      // Already deprecated; only resurrect if usage shoots up.
      if (usageShare > DECAYING_USAGE_FLOOR && health >= ACTIVE_HEALTH) {
        nextStage = "active";
        reason = `resurrected usage_share=${usageShare.toFixed(2)} health=${health.toFixed(1)}`;
      } else {
        continue; // no change
      }
    } else if (prev.stage === "decaying") {
      const ageDays = (Date.now() - new Date(prev.entered_at).getTime()) / DAY_MS;
      if (ageDays >= DEPRECATION_DAYS) {
        nextStage = "deprecated";
        reason = `decaying_for_${ageDays.toFixed(1)}d`;
      } else if (health >= ACTIVE_HEALTH && dropoff < DECAYING_DROPOFF) {
        nextStage = "active";
        reason = `recovered health=${health.toFixed(1)} dropoff=${dropoff.toFixed(2)}`;
      } else {
        continue;
      }
    } else {
      // emerging | active | dominant — re-evaluate using current health.
      if (usageShare < DECAYING_USAGE_FLOOR && dropoff > DECAYING_DROPOFF) {
        nextStage = "decaying";
        reason = `low_usage_share=${usageShare.toFixed(2)} dropoff=${dropoff.toFixed(2)}`;
      } else if (health >= DOMINANT_HEALTH && usageShare > 20) {
        nextStage = "dominant";
        reason = `dominant health=${health.toFixed(1)} usage_share=${usageShare.toFixed(2)}`;
      } else if (health >= ACTIVE_HEALTH) {
        nextStage = "active";
        reason = `active health=${health.toFixed(1)}`;
      } else {
        nextStage = "emerging";
        reason = `still_emerging health=${health.toFixed(1)}`;
      }
    }

    if (prev?.stage !== nextStage) {
      await recordTransition(n.node_id, nextStage, reason, {
        usage_share: usageShare,
        health_score: health,
        dropoff_rate: dropoff,
      });
      tally(`${prev?.stage ?? "∅"}→${nextStage}`);
    }
  }

  return { nodes_evaluated: nodes.length, transitions };
}
