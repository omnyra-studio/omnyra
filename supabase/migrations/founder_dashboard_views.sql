-- Founder dashboard views.
-- Queried via service-role client only — no RLS applies to views by default.
-- All views are read-only aggregations over existing tables.

-- ── job metrics rollup ────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW founder_job_metrics AS
SELECT
  j.id,
  j.user_id,
  j.status,
  j.stage,
  j.pipeline_status,
  j.error,
  j.last_error_code,
  j.retry_count,
  j.created_at,
  j.updated_at,
  ROUND(EXTRACT(EPOCH FROM (j.updated_at - j.created_at)) * 1000)::BIGINT AS total_duration_ms,
  COALESCE(SUM(c.cost_estimate), 0)                                         AS total_cost_credits
FROM avatar_jobs j
LEFT JOIN external_api_cost_ledger c
  ON c.job_id = j.id AND c.status = 'charged'
GROUP BY
  j.id, j.user_id, j.status, j.stage, j.pipeline_status,
  j.error, j.last_error_code, j.retry_count, j.created_at, j.updated_at;

-- ── per-stage execution time ──────────────────────────────────────────────────
CREATE OR REPLACE VIEW founder_stage_latency AS
SELECT
  l.job_id,
  l.stage,
  l.status,
  ROUND(EXTRACT(EPOCH FROM (l.updated_at - l.created_at)) * 1000)::BIGINT AS duration_ms,
  l.created_at,
  l.updated_at
FROM avatar_stage_ledger l
WHERE l.status IN ('completed', 'failed');

-- ── provider cost breakdown ───────────────────────────────────────────────────
CREATE OR REPLACE VIEW founder_provider_costs AS
SELECT
  job_id,
  provider,
  stage,
  status,
  cost_estimate
FROM external_api_cost_ledger;
