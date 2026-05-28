/**
 * Pipeline runner and stage registry for the shot plan generation pipeline.
 *
 * Each stage is a named function so errors are attributable and timing is
 * observable. The runner wraps every stage in a try/catch that prefixes the
 * error message with the stage name — "Failed to parse" becomes
 * "[parse_director_output] Failed to parse".
 *
 * Stages are typed generically so the runner composes cleanly without casting,
 * while still providing full type inference at the call site.
 */

// ── Stage registry ─────────────────────────────────────────────────────────────

/** Ordered list of all named stages in the shot-plan generation pipeline. */
export const SHOT_PLAN_STAGES = [
  "resolve_script",
  "fetch_context",
  "call_director",
  "parse_director_output",
  "enforce_director_rules",
  "apply_narration_durations",
  "rebalance_timeline",
  "validate_plan",
  "persist_plan",
  "persist_shots",
] as const;

export type ShotPlanStage = (typeof SHOT_PLAN_STAGES)[number];

// ── Runner ─────────────────────────────────────────────────────────────────────

export interface Stage<TIn, TOut> {
  name: string;
  run: (input: TIn) => Promise<TOut>;
}

export interface StageTrace {
  stage:      string;
  durationMs: number;
  error?:     string;
}

/**
 * Run stages sequentially, threading output of each stage into the next.
 * Wraps failures with the stage name. Returns stage traces for observability.
 *
 * @throws Error — message is prefixed `[stage_name] original message`
 */
export async function runPipeline<TIn, TOut>(
  stages: Array<Stage<unknown, unknown>>,
  input:  TIn,
): Promise<{ output: TOut; traces: StageTrace[] }> {
  const traces: StageTrace[] = [];
  let current: unknown = input;

  for (const stage of stages) {
    const t0 = Date.now();
    try {
      current = await stage.run(current);
      traces.push({ stage: stage.name, durationMs: Date.now() - t0 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const wrapped = new Error(`[${stage.name}] ${msg}`);
      traces.push({ stage: stage.name, durationMs: Date.now() - t0, error: msg });
      throw wrapped;
    }
  }

  return { output: current as TOut, traces };
}
