/* Autonomous PRD generator.
 *
 * Detects high-signal patterns in the event stream + behavior graph
 * and generates a structured PRD for each. PRDs are persisted with
 * status='draft' and a priority_score. Spec §3: "NO IDEAS WITHOUT
 * EVIDENCE" — every PRD carries the metrics that justified it.
 *
 * Two layers:
 *   1. Signal detectors (deterministic, no LLM) — find candidate
 *      problems from the data.
 *   2. PRD writer (Claude) — turns each signal into prose with
 *      problem statement + proposed solution.
 */

import { supabaseAdmin } from "../supabase/admin";

const MODEL = "claude-sonnet-4-6";
const REGENERATE_PROBLEM_THRESHOLD = 0.4;
const ACTIVATION_PROBLEM_THRESHOLD = 0.3;
const HIGH_DROPOFF_NODE_THRESHOLD = 0.5;

export interface PRDSignal {
  source_signal: string;
  title: string;
  problem_observation: string;
  evidence: Record<string, unknown>;
  metrics_to_move: string[];
  expected_impact: number; // 0..100
}

/* ─── Signal detectors ────────────────────────────────────────── */

async function detectRegenerateProblem(): Promise<PRDSignal | null> {
  const { data } = await supabaseAdmin
    .from("system_insights")
    .select("value, context")
    .eq("metric_name", "regenerate_rate")
    .order("created_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (!row) return null;
  const rate = Number(row.value);
  if (rate < REGENERATE_PROBLEM_THRESHOLD) return null;
  return {
    source_signal: "high_regenerate_rate",
    title: "Auto-script improvement on first generation",
    problem_observation: `Users are regenerating ${(rate * 100).toFixed(1)}% of their scripts on first try — the initial output isn't landing.`,
    evidence: { regenerate_rate: rate, context: row.context },
    metrics_to_move: ["regenerate_rate", "activation_rate", "render_completion_rate"],
    expected_impact: Math.min(100, Math.round((rate - REGENERATE_PROBLEM_THRESHOLD) * 200)),
  };
}

async function detectBriefAbandonment(): Promise<PRDSignal | null> {
  // Compare brief_submitted vs render_requested in the last 30d.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count: briefs } = await supabaseAdmin
    .from("events").select("*", { count: "exact", head: true })
    .eq("type", "brief_submitted").gte("created_at", since);
  const { count: requested } = await supabaseAdmin
    .from("events").select("*", { count: "exact", head: true })
    .eq("type", "render_requested").gte("created_at", since);
  if (!briefs || briefs === 0) return null;
  const conversion = (requested ?? 0) / briefs;
  if (conversion >= 0.7) return null;
  const abandonment = 1 - conversion;
  return {
    source_signal: "brief_stage_abandonment",
    title: "1-click smart brief auto-fill",
    problem_observation: `${(abandonment * 100).toFixed(1)}% of users who submit a brief never approve a render. The brief stage is a leaky bucket.`,
    evidence: { briefs, requested, conversion },
    metrics_to_move: ["activation_rate", "time_to_first_video"],
    expected_impact: Math.min(100, Math.round(abandonment * 100)),
  };
}

async function detectActivationProblem(): Promise<PRDSignal | null> {
  const { data } = await supabaseAdmin
    .from("analytics_snapshots")
    .select("value, context")
    .eq("metric_name", "activation_rate")
    .eq("scope", "global")
    .order("snapshot_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (!row) return null;
  const rate = Number(row.value);
  if (rate >= ACTIVATION_PROBLEM_THRESHOLD) return null;
  return {
    source_signal: "low_activation",
    title: "Reduce onboarding friction with smart defaults",
    problem_observation: `Only ${(rate * 100).toFixed(1)}% of new signups create a first video within 7 days. Onboarding is filtering out potential paying users.`,
    evidence: { activation_rate: rate, context: row.context },
    metrics_to_move: ["activation_rate", "time_to_first_video"],
    expected_impact: Math.min(100, Math.round((ACTIVATION_PROBLEM_THRESHOLD - rate) * 200)),
  };
}

async function detectHighDropoffNode(): Promise<PRDSignal | null> {
  const { data } = await supabaseAdmin
    .from("product_behavior_graph")
    .select("node_id, display_name, dropoff_rate, usage_count, node_type")
    .gt("usage_count", 20)
    .gte("dropoff_rate", HIGH_DROPOFF_NODE_THRESHOLD)
    .order("dropoff_rate", { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (!row) return null;
  return {
    source_signal: `high_dropoff_${row.node_id}`,
    title: `Address dropoff at "${row.display_name}"`,
    problem_observation: `Sessions that hit "${row.display_name}" abandon ${(Number(row.dropoff_rate) * 100).toFixed(1)}% of the time. This node is a cliff.`,
    evidence: { node: row.node_id, dropoff_rate: row.dropoff_rate, usage_count: row.usage_count },
    metrics_to_move: ["activation_rate", "render_completion_rate"],
    expected_impact: Math.min(100, Math.round(Number(row.dropoff_rate) * 80)),
  };
}

const DETECTORS = [
  detectRegenerateProblem,
  detectBriefAbandonment,
  detectActivationProblem,
  detectHighDropoffNode,
];

/* ─── LLM writer ──────────────────────────────────────────────── */

interface AnthropicTextBlock { type: "text"; text: string }
interface AnthropicResp { content?: AnthropicTextBlock[]; error?: { message: string } }

async function writePRDProse(signal: PRDSignal): Promise<{ problem_statement: string; proposed_solution: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    // No LLM available — return a deterministic fallback so the system
    // still produces actionable drafts.
    return {
      problem_statement: signal.problem_observation,
      proposed_solution: `Investigate "${signal.title}" — design an intervention that moves: ${signal.metrics_to_move.join(", ")}.`,
    };
  }

  const system = `You are a senior product manager writing a PRD draft for the Omnyra AI engineering team. The PRD is generated from real usage signals — be concrete, cite the numbers, propose a specific shippable intervention. No marketing fluff. Output strictly JSON: {"problem_statement": "...", "proposed_solution": "..."}. Each field 60–150 words.`;

  const user = `Signal: ${signal.source_signal}\nTitle: ${signal.title}\nObservation: ${signal.problem_observation}\nEvidence: ${JSON.stringify(signal.evidence)}\nMetrics to move: ${signal.metrics_to_move.join(", ")}\n\nWrite the PRD draft as JSON.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 600, system, messages: [{ role: "user", content: user }] }),
  });
  const data = (await res.json()) as AnthropicResp;
  if (data.error) {
    console.error("[prd] anthropic error:", data.error.message);
    return {
      problem_statement: signal.problem_observation,
      proposed_solution: `(LLM unavailable) Investigate ${signal.title}.`,
    };
  }
  const text = data.content?.[0]?.text ?? "";
  // Tolerant JSON parse — strip code fences if present.
  const cleaned = text.replace(/```json\s*|\s*```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as { problem_statement?: string; proposed_solution?: string };
    return {
      problem_statement: parsed.problem_statement ?? signal.problem_observation,
      proposed_solution: parsed.proposed_solution ?? `Investigate ${signal.title}.`,
    };
  } catch {
    return {
      problem_statement: signal.problem_observation,
      proposed_solution: text || `Investigate ${signal.title}.`,
    };
  }
}

/* ─── Public ─────────────────────────────────────────────────── */

export interface PRDGenerationResult {
  signals_detected: number;
  prds_inserted: number;
  prds_skipped_existing: number;
}

export async function generatePRDsFromSignals(): Promise<PRDGenerationResult> {
  const detected: PRDSignal[] = [];
  for (const detector of DETECTORS) {
    const sig = await detector();
    if (sig) detected.push(sig);
  }

  let inserted = 0;
  let skipped = 0;
  const recent = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  for (const sig of detected) {
    // De-dup: don't reissue the same signal within 7 days.
    const { data: existing } = await supabaseAdmin
      .from("generated_prds")
      .select("id")
      .eq("source_signal", sig.source_signal)
      .gte("created_at", recent)
      .limit(1);
    if (existing && existing.length > 0) {
      skipped += 1;
      continue;
    }

    const prose = await writePRDProse(sig);
    await supabaseAdmin.from("generated_prds").insert({
      title: sig.title,
      problem_statement: prose.problem_statement,
      user_evidence: sig.evidence,
      proposed_solution: prose.proposed_solution,
      impacted_metrics: sig.metrics_to_move,
      priority_score: sig.expected_impact,
      status: "draft",
      source_signal: sig.source_signal,
    });
    inserted += 1;
  }

  return {
    signals_detected: detected.length,
    prds_inserted: inserted,
    prds_skipped_existing: skipped,
  };
}
