-- system_insights extension — adds rich categorization columns.
--
-- The base table (system_insights_table.sql) contains the AGS observation
-- schema (metric_name, value, context, impact_score, recommendation_action).
-- This migration extends it with display-oriented and routing columns that
-- let admin UIs, the founder dashboard, and the strategy engine surface
-- insights without parsing raw metric data.
--
-- Safe to run multiple times (all statements are idempotent).

-- ── New columns ───────────────────────────────────────────────────────────────

-- High-level category: 'performance' | 'funnel' | 'churn' | 'revenue' |
-- 'product' | 'content' | 'system'. Distinct from metric_name (which names
-- the specific metric) — allows grouping across metric families.
ALTER TABLE system_insights
  ADD COLUMN IF NOT EXISTS insight_type TEXT;

-- Short display title (≤120 chars). Shown in admin dashboards and alerts.
ALTER TABLE system_insights
  ADD COLUMN IF NOT EXISTS title TEXT;

-- Human-readable explanation of what this insight means and why it matters.
-- Complements `recommendation` (which focuses on action); `summary` focuses
-- on interpretation of the observation.
ALTER TABLE system_insights
  ADD COLUMN IF NOT EXISTS summary TEXT;

-- Flexible metadata bag for module-specific data that doesn't belong in
-- `context` (which already has semantic meaning in the AGS pipeline).
-- Examples: { "p50_ms": 1200, "p95_ms": 3400, "sample_window": "7d" }
ALTER TABLE system_insights
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Urgency: 'info' | 'warning' | 'critical'
ALTER TABLE system_insights
  ADD COLUMN IF NOT EXISTS severity TEXT
  CHECK (severity IS NULL OR severity IN ('info', 'warning', 'critical'));

-- Which system module wrote this row. Allows attribution and silencing
-- noisy sources. E.g. 'cron/optimize-system', 'cron/optimize-funnel',
-- 'prd-generator', 'strategy-engine'.
ALTER TABLE system_insights
  ADD COLUMN IF NOT EXISTS source TEXT;

-- Model confidence 0.0–1.0 in the recommendation, when computed by an LLM
-- or probabilistic model.  Distinct from impact_score (0–100 business
-- importance); confidence_score is the model's self-assessed certainty.
ALTER TABLE system_insights
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5, 4)
  CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 1);

-- Optional user scope. When set, the insight relates to a specific user
-- (e.g. churn risk, personalisation signal). NULL = system-wide insight.
ALTER TABLE system_insights
  ADD COLUMN IF NOT EXISTS user_id UUID
  REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── New indexes ───────────────────────────────────────────────────────────────

-- Filter by type in admin dashboards and the strategy engine.
CREATE INDEX IF NOT EXISTS idx_system_insights_type_created
  ON system_insights(insight_type, created_at DESC);

-- Triage queue: surface critical/warning insights that are unapplied.
CREATE INDEX IF NOT EXISTS idx_system_insights_severity_pending
  ON system_insights(severity, created_at DESC)
  WHERE applied_at IS NULL;

-- Per-user insight lookup (churn risk, retention triggers).
CREATE INDEX IF NOT EXISTS idx_system_insights_user_id
  ON system_insights(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Source attribution — filter by module.
CREATE INDEX IF NOT EXISTS idx_system_insights_source_created
  ON system_insights(source, created_at DESC);
