/**
 * Optimization pass runner — applies all 5 passes in sequence until convergence.
 *
 * Pass order (LLVM-style, fixed):
 *   1. DNE  — Dead Node Elimination     (remove no-op nodes first)
 *   2. PCR  — Provider Cost Rewriting   (assign providers before fusion)
 *   3. NF   — Node Fusion               (fuse after providers are known)
 *   4. TEC  — Temporal Edge Compression (clean up edge set after fusions)
 *   5. ELO  — Embedding Locality Opt    (reorder within groups last)
 *
 * Convergence: a pass "changed the graph" iff passHistory grew.
 * Loop terminates when no pass changes anything OR after MAX_ITERATIONS.
 *
 * Semantic equivalence invariant is each pass's responsibility.
 * The runner only enforces loop termination.
 */

import type { IRGraph } from "../ir";
import type { RoutingContext } from "@/lib/routing/types";
import { dne } from "./dne";
import { pcr } from "./pcr";
import { nf  } from "./nf";
import { tec } from "./tec";
import { elo } from "./elo";

const MAX_ITERATIONS = 3;

export function runPasses(graph: IRGraph, context: RoutingContext): IRGraph {
  let   current    = graph;
  let   iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    const before = current.passHistory.length;

    current = dne(current);
    current = pcr(current, context);
    current = nf(current);
    current = tec(current);
    current = elo(current);

    const after = current.passHistory.length;

    // No pass changed the graph → converged
    if (after === before) break;

    iterations++;
  }

  return current;
}
