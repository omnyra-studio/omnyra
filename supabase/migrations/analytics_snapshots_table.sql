-- Append-only analytics history.
--
-- Per spec "Analytics Aggregation System":
--   - SOURCE OF TRUTH: events table ONLY
--   - Historical snapshots MUST be preserved (not overwritten)
--   - Dashboard must NEVER read raw events directly
--
-- This table is the BI store. Every cron tick inserts new rows;
-- nothing is updated or deleted.

CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_name     TEXT NOT NULL,
  -- "global" | "user" | "template" — determines what dimension_id holds.
  scope           TEXT NOT NULL,
  -- For scope='user' this is a user_id; for 'template' the template name;
  -- for 'global' it is NULL.
  dimension_id    TEXT,
  -- Numeric metric value (rate, count, score, etc.).
  value           NUMERIC(14,4),
  -- Free-form context (sample size, window, components, etc.).
  context         JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Inclusive window the metric covers.
  window_start    TIMESTAMPTZ NOT NULL,
  window_end      TIMESTAMPTZ NOT NULL,
  snapshot_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_metric_time
  ON analytics_snapshots(metric_name, snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_scope_dim
  ON analytics_snapshots(scope, dimension_id, snapshot_at DESC)
  WHERE dimension_id IS NOT NULL;

ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;

-- Per-user snapshots readable by the user; global / template scope is
-- service_role only (read via admin dashboards).
DROP POLICY IF EXISTS "analytics_snapshots_user_read" ON analytics_snapshots;
CREATE POLICY "analytics_snapshots_user_read"
  ON analytics_snapshots FOR SELECT
  USING (scope = 'user' AND dimension_id = auth.uid()::text);
