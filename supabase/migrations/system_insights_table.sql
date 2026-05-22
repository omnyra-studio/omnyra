-- Autonomous Growth System (AGS) — insights ledger.
--
-- The optimisation engine (runs every 6h via /api/cron/optimize-system)
-- writes one row per computed metric per run. Recommendations are
-- generated alongside the raw metric for traceability.
--
-- GOVERNOR RULES (from spec) — this table is the audit log:
--   * automation must never override admin settings,
--   * all changes must be gradual + reversible,
--   * every change must be logged here BEFORE being applied.
-- If an insight has `applied_at IS NULL`, it has not yet acted on the
-- system; once applied, the row is closed.

CREATE TABLE IF NOT EXISTS system_insights (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_name       TEXT NOT NULL,
  -- Numeric value for the metric (rates 0..1, counts as integers, etc.).
  value             NUMERIC(14,4),
  -- Free-form context: prior value, sample size, window, etc.
  context           JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 'up' | 'down' | 'flat' — drift direction vs prior window.
  trend_direction   TEXT,
  -- 0..100; how much this metric matters to the AGS.
  impact_score      INTEGER NOT NULL DEFAULT 0,
  -- Human-readable summary of what the engine wants to do, if anything.
  recommendation    TEXT,
  -- Structured form of the recommendation. Whitelisted action types only
  -- — see lib/optimization/insights.ts.
  recommendation_action JSONB,
  -- NULL until an applier acts on this insight. When set, indicates
  -- the recommendation was executed.
  applied_at        TIMESTAMPTZ,
  applied_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_insights_metric_created
  ON system_insights(metric_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_insights_pending
  ON system_insights(created_at DESC)
  WHERE applied_at IS NULL;

ALTER TABLE system_insights ENABLE ROW LEVEL SECURITY;
-- No client policy. service_role only. Insights are internal product
-- intelligence; expose curated slices via admin routes if needed.
