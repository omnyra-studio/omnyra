/* Product behavior graph builder.
 *
 * Reads from the events stream and rebuilds `product_behavior_graph` —
 * one row per UI node — with current usage / dropoff / time-spent
 * metrics and the outgoing edge list (`connected_nodes`).
 *
 * NODE INFERENCE:
 *   Nodes are derived from event types. Each tracked event becomes a
 *   node. The edge weight from A → B is the count of A-followed-by-B
 *   within a session (defined as 30 minutes of inactivity).
 *
 * This is batch-only; nothing here runs in a request path.
 */

import { supabaseAdmin } from "../supabase/admin";

const WINDOW_DAYS = 30;
const SESSION_GAP_MS = 30 * 60 * 1000;

interface RawEvent {
  user_id: string | null;
  type: string;
  created_at: string;
}

interface NodeMetric {
  node_id: string;
  node_type: "feature" | "screen" | "flow" | "button";
  display_name: string;
  user_set: Set<string>;
  total_visits: number;
  dropoffs: number;       // visits that ended the session immediately
  duration_sum_ms: number;
  duration_count: number;
}

interface Edge {
  from: string;
  to: string;
  weight: number;
}

/**
 * Coarse node-type classifier from the event type. Refine over time as
 * the team adds more granular event taxonomies.
 */
function classifyNode(eventType: string): { node_id: string; node_type: NodeMetric["node_type"]; display_name: string } {
  // Pipeline / engagement events are "feature" nodes.
  if (eventType.startsWith("video_") || eventType.startsWith("render_") || eventType === "brief_submitted" || eventType === "brief_created" || eventType === "draft_generated") {
    return { node_id: eventType, node_type: "feature", display_name: eventType.replace(/_/g, " ") };
  }
  // Auth / onboarding are "flow" nodes.
  if (eventType.startsWith("user_") || eventType.startsWith("onboarding_")) {
    return { node_id: eventType, node_type: "flow", display_name: eventType.replace(/_/g, " ") };
  }
  // Selection / template events are "button"-ish.
  if (eventType.includes("selected")) {
    return { node_id: eventType, node_type: "button", display_name: eventType.replace(/_/g, " ") };
  }
  // Revenue-side events are "feature".
  return { node_id: eventType, node_type: "feature", display_name: eventType.replace(/_/g, " ") };
}

function computeHealth(node: NodeMetric, conversionImpact: number): number {
  // High usage + low dropoff + positive conversion ⇒ healthy.
  const usageNorm = Math.min(100, Math.log10(Math.max(1, node.total_visits)) * 25);
  const dropoffPenalty = (node.dropoffs / Math.max(1, node.total_visits)) * 100;
  const score = 0.5 * usageNorm + 0.3 * (100 - dropoffPenalty) + 0.2 * conversionImpact;
  return Math.max(0, Math.min(100, score));
}

export interface GraphRebuildResult {
  nodes_written: number;
  edges_counted: number;
  events_processed: number;
}

export async function rebuildBehaviorGraph(): Promise<GraphRebuildResult> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Pull events ordered per user then time so we can compute sessions
  // + edges in one pass. Cap to a sane limit to avoid OOM; downstream
  // tests should re-run if the dataset is huge.
  const { data: rows } = await supabaseAdmin
    .from("events")
    .select("user_id, type, created_at")
    .gte("created_at", since)
    .not("user_id", "is", null)
    .order("user_id", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(100000);

  const events = (rows ?? []) as RawEvent[];
  const nodes = new Map<string, NodeMetric>();
  const edgeKeys = new Map<string, number>(); // "from→to" → weight
  let edgesCounted = 0;

  let prevUser: string | null = null;
  let prevType: string | null = null;
  let prevTime = 0;

  for (const e of events) {
    if (!e.user_id) continue;
    const t = new Date(e.created_at).getTime();
    const sessionContinues = e.user_id === prevUser && t - prevTime <= SESSION_GAP_MS;

    const cls = classifyNode(e.type);
    let node = nodes.get(cls.node_id);
    if (!node) {
      node = {
        node_id: cls.node_id,
        node_type: cls.node_type,
        display_name: cls.display_name,
        user_set: new Set<string>(),
        total_visits: 0,
        dropoffs: 0,
        duration_sum_ms: 0,
        duration_count: 0,
      };
      nodes.set(cls.node_id, node);
    }
    node.total_visits += 1;
    node.user_set.add(e.user_id);

    if (sessionContinues && prevType) {
      // Edge from prevType → e.type
      const dt = t - prevTime;
      // Attribute the dt as "time spent on prev node".
      const prev = nodes.get(prevType);
      if (prev) {
        prev.duration_sum_ms += dt;
        prev.duration_count += 1;
      }
      const key = `${prevType}→${e.type}`;
      edgeKeys.set(key, (edgeKeys.get(key) ?? 0) + 1);
      edgesCounted += 1;
    }

    prevUser = e.user_id;
    prevType = e.type;
    prevTime = t;
  }

  // Dropoff inference: a "dropoff" is a node that ended a session
  // (no following event for that user within the gap). Walk the events
  // again and flag the last-in-session.
  prevUser = null;
  prevTime = 0;
  let lastInSessionNode: string | null = null;
  for (const e of events) {
    if (!e.user_id) continue;
    const t = new Date(e.created_at).getTime();
    if (e.user_id !== prevUser || t - prevTime > SESSION_GAP_MS) {
      // Session change. The previous lastInSessionNode terminated a session.
      if (lastInSessionNode) {
        const n = nodes.get(lastInSessionNode);
        if (n) n.dropoffs += 1;
      }
    }
    lastInSessionNode = e.type;
    prevUser = e.user_id;
    prevTime = t;
  }
  if (lastInSessionNode) {
    const n = nodes.get(lastInSessionNode);
    if (n) n.dropoffs += 1;
  }

  // Conversion impact per node: of users who hit this node, what % also
  // hit `render_completed`? Bounded approximation.
  const { data: convertedRows } = await supabaseAdmin
    .from("events")
    .select("user_id")
    .eq("type", "render_completed")
    .gte("created_at", since);
  const converters = new Set((convertedRows ?? []).map((r) => r.user_id as string));

  // Build edge list per node (top-K outgoing edges).
  const outEdges = new Map<string, Edge[]>();
  for (const [key, weight] of edgeKeys.entries()) {
    const [from, to] = key.split("→");
    if (!outEdges.has(from)) outEdges.set(from, []);
    outEdges.get(from)!.push({ from, to, weight });
  }

  let nodesWritten = 0;
  for (const node of nodes.values()) {
    const visitors = node.user_set.size;
    const conversionImpact = visitors === 0 ? 0 : (Array.from(node.user_set).filter((u) => converters.has(u)).length / visitors) * 100;
    const dropoffRate = node.total_visits === 0 ? 0 : node.dropoffs / node.total_visits;
    const avgTimeSeconds = node.duration_count === 0 ? 0 : (node.duration_sum_ms / node.duration_count) / 1000;
    const health = computeHealth(node, conversionImpact);

    const edges = (outEdges.get(node.node_id) ?? [])
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8)
      .map((e) => ({ to: e.to, weight: e.weight }));

    await supabaseAdmin.from("product_behavior_graph").upsert(
      {
        node_id: node.node_id,
        node_type: node.node_type,
        display_name: node.display_name,
        usage_count: visitors,
        dropoff_rate: Number(dropoffRate.toFixed(4)),
        conversion_impact: Number(conversionImpact.toFixed(2)),
        avg_time_spent: Number(avgTimeSeconds.toFixed(2)),
        connected_nodes: edges,
        health_score: Number(health.toFixed(2)),
      },
      { onConflict: "node_id" },
    );
    nodesWritten += 1;
  }

  return {
    nodes_written: nodesWritten,
    edges_counted: edgesCounted,
    events_processed: events.length,
  };
}
