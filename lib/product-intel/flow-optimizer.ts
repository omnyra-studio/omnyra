/* UI flow optimiser.
 *
 * Reads the behaviour graph and proposes flow simplifications:
 *   - REMOVE_STEP    : a node with very high dropoff that adds no value
 *   - PREFILL_STEP   : a node where users overwhelmingly choose one
 *                       option (≥ 80%) — pre-fill it
 *   - MERGE_STEPS    : two consecutive nodes with very strong A→B
 *                       transitions (≥ 90% pass-through) → merge them
 *
 * Each proposal is bound to a feature_flag so the rollout is canary-
 * controlled per spec §9.
 *
 * Server-only.
 */

import { supabaseAdmin } from "../supabase/admin";

const DROPOFF_FOR_REMOVAL = 0.6;
const PASSTHROUGH_FOR_MERGE = 0.9;

interface GraphRow {
  node_id: string;
  node_type: string;
  display_name: string;
  usage_count: number;
  dropoff_rate: number;
  connected_nodes: Array<{ to: string; weight: number }>;
}

export interface FlowProposal {
  flow_id: string;
  proposal_type: "remove_step" | "prefill_step" | "merge_steps" | "reorder";
  current_path: string[];
  proposed_path: string[];
  expected_impact: number;
  source_metrics: Record<string, unknown>;
}

async function ensureFlag(flagKey: string, description: string, sourcePrdId: string | null = null): Promise<void> {
  await supabaseAdmin.from("feature_flags").upsert(
    {
      key: flagKey,
      description,
      enabled: false,
      rollout_percent: 0,
      source_prd_id: sourcePrdId,
    },
    { onConflict: "key" },
  );
}

export interface OptimizationResult {
  proposals_emitted: number;
  proposals_skipped_existing: number;
}

export async function proposeUIFlowOptimizations(): Promise<OptimizationResult> {
  const { data: graphRows } = await supabaseAdmin
    .from("product_behavior_graph")
    .select("node_id, node_type, display_name, usage_count, dropoff_rate, connected_nodes")
    .gt("usage_count", 20);

  const graph = (graphRows ?? []) as GraphRow[];
  const proposals: FlowProposal[] = [];

  for (const node of graph) {
    // ── REMOVE_STEP — high dropoff with low forward flow ──────────
    if (Number(node.dropoff_rate) >= DROPOFF_FOR_REMOVAL && (node.connected_nodes?.length ?? 0) > 0) {
      const topEdge = node.connected_nodes.sort((a, b) => b.weight - a.weight)[0];
      if (topEdge) {
        proposals.push({
          flow_id: `auto:${node.node_id}`,
          proposal_type: "remove_step",
          current_path: [node.node_id, topEdge.to],
          proposed_path: [topEdge.to],
          expected_impact: Math.round(Number(node.dropoff_rate) * 80),
          source_metrics: { dropoff_rate: node.dropoff_rate, usage_count: node.usage_count },
        });
      }
    }

    // ── MERGE_STEPS — two nodes with ≥ 90% pass-through ──────────
    if (Array.isArray(node.connected_nodes) && node.connected_nodes.length > 0) {
      const total = node.connected_nodes.reduce((s, e) => s + e.weight, 0);
      const top = node.connected_nodes.sort((a, b) => b.weight - a.weight)[0];
      if (total > 0 && top.weight / total >= PASSTHROUGH_FOR_MERGE) {
        proposals.push({
          flow_id: `auto:${node.node_id}_${top.to}`,
          proposal_type: "merge_steps",
          current_path: [node.node_id, top.to],
          proposed_path: [`merged:${node.node_id}+${top.to}`],
          expected_impact: 40,
          source_metrics: { passthrough_ratio: top.weight / total, edge_weight: top.weight },
        });
      }
    }
  }

  let emitted = 0;
  let skipped = 0;
  const recent = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  for (const p of proposals) {
    // De-dup on (flow_id, proposal_type) within last 14d.
    const { data: existing } = await supabaseAdmin
      .from("ui_flow_proposals")
      .select("id, status")
      .eq("flow_id", p.flow_id)
      .eq("proposal_type", p.proposal_type)
      .gte("created_at", recent)
      .limit(1);
    if (existing && existing.length > 0) {
      skipped += 1;
      continue;
    }

    // Create the controlling feature flag (disabled by default).
    const flagKey = `ui_flow.${p.flow_id}.${p.proposal_type}`;
    await ensureFlag(
      flagKey,
      `${p.proposal_type} for ${p.flow_id} — expected_impact=${p.expected_impact}`,
    );

    await supabaseAdmin.from("ui_flow_proposals").insert({
      flow_id: p.flow_id,
      proposal_type: p.proposal_type,
      current_path: p.current_path,
      proposed_path: p.proposed_path,
      expected_impact: p.expected_impact,
      source_metrics: p.source_metrics,
      flag_key: flagKey,
      status: "proposed",
    });
    emitted += 1;
  }

  return { proposals_emitted: emitted, proposals_skipped_existing: skipped };
}
