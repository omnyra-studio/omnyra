/* GET /api/cron/product-intelligence
 *
 * Weekly run of the Self-Evolving Product Intelligence System.
 *
 *   1. Rebuild product_behavior_graph from the events stream.
 *   2. Recompute feature_lifecycle stages (emerging → … → deprecated).
 *   3. Generate PRDs from high-signal patterns (via Claude).
 *   4. Propose UI flow optimisations + provision the controlling
 *      feature flags (disabled by default — humans flip enabled=true).
 *
 * Spec §9 safety: no flags are enabled by this job. Every change goes
 * through the flag layer + canary, never globally.
 */

import { rebuildBehaviorGraph } from "../../../../lib/product-intel/graph";
import { recomputeFeatureLifecycle } from "../../../../lib/product-intel/lifecycle";
import { generatePRDsFromSignals } from "../../../../lib/product-intel/prd-generator";
import { proposeUIFlowOptimizations } from "../../../../lib/product-intel/flow-optimizer";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  const graph = await rebuildBehaviorGraph();
  const lifecycle = await recomputeFeatureLifecycle();
  const prds = await generatePRDsFromSignals();
  const flows = await proposeUIFlowOptimizations();

  return Response.json({
    ok: true,
    duration_ms: Date.now() - started,
    graph,
    lifecycle,
    prds,
    flows,
  });
}
