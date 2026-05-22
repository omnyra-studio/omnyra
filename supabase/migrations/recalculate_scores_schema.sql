-- Batch scoring system.
--
-- This migration enforces the spec rule:
--   "NEVER update scores inside API requests.
--    ALL scoring must be batch processed."
--
--   1. Drop the trigger that recomputed viral_score on every event
--      insert (that was inline scoring in the request path).
--   2. Update the viral_score formula to the canonical weights.
--   3. Create template_scores + user_scores output tables.
--   4. The /api/cron/recalculate-scores job runs every 15 minutes and
--      UPSERTs into all three score tables (idempotent).
--
-- The `calculate_viral_score()` function is preserved for ad-hoc
-- recompute calls (e.g. tests, manual reconciliation) but is no longer
-- automatically invoked by any trigger.

-- ── 1. Drop the auto-recompute trigger ───────────────────────────────
DROP TRIGGER IF EXISTS events_recalc_viral_score ON events;
DROP FUNCTION IF EXISTS trg_recalc_viral_score();

-- ── 2. Update the viral_score formula ────────────────────────────────
-- Canonical weights (spec):
--   downloads        * 0.3
--   shares           * 0.4
--   completion_rate  * 0.2
--   replays          * 0.1
-- Each raw count is normalised to a 0..100 contribution before weighting
-- (downloads/shares/replays capped at 100; completion_rate * 100).

CREATE OR REPLACE FUNCTION calculate_viral_score(p_render_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user        UUID;
  v_views       NUMERIC := 0;
  v_shares      NUMERIC := 0;
  v_downloads   NUMERIC := 0;
  v_replays     NUMERIC := 0;
  v_completion  NUMERIC := 0;
  v_watch_time  NUMERIC := 0;
  v_score       NUMERIC;
BEGIN
  SELECT user_id INTO v_user FROM renders WHERE id = p_render_id;
  IF v_user IS NULL THEN
    RETURN 0;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE type = 'video_viewed'),
    COUNT(*) FILTER (WHERE type = 'video_shared'),
    COUNT(*) FILTER (WHERE type = 'video_downloaded'),
    COUNT(*) FILTER (WHERE type = 'video_replayed'),
    COALESCE(AVG(NULLIF((payload->>'completion_rate'), '')::numeric)
             FILTER (WHERE type = 'video_completed'), 0),
    COALESCE(AVG(NULLIF((payload->>'watch_time_seconds'), '')::numeric)
             FILTER (WHERE type = 'video_viewed'), 0)
  INTO v_views, v_shares, v_downloads, v_replays, v_completion, v_watch_time
  FROM events
  WHERE (payload->>'render_id') = p_render_id::text;

  v_score := 0.30 * LEAST(v_downloads,        100)
           + 0.40 * LEAST(v_shares,           100)
           + 0.20 * LEAST(v_completion * 100, 100)
           + 0.10 * LEAST(v_replays,          100);

  INSERT INTO content_scores (
    render_id, user_id, viral_score, views, completion_rate,
    watch_time_seconds, shares, downloads, recalculated_at
  )
  VALUES (
    p_render_id, v_user, v_score, v_views, v_completion,
    v_watch_time, v_shares, v_downloads, now()
  )
  ON CONFLICT (render_id) DO UPDATE SET
    viral_score        = EXCLUDED.viral_score,
    views              = EXCLUDED.views,
    completion_rate    = EXCLUDED.completion_rate,
    watch_time_seconds = EXCLUDED.watch_time_seconds,
    shares             = EXCLUDED.shares,
    downloads          = EXCLUDED.downloads,
    recalculated_at    = now();

  UPDATE renders SET viral_score = v_score::integer WHERE id = p_render_id;

  RETURN v_score;
END;
$$;

-- ── 3. Add replays column to content_scores ─────────────────────────
ALTER TABLE content_scores
  ADD COLUMN IF NOT EXISTS replays INTEGER NOT NULL DEFAULT 0;

-- ── 4. template_scores output table ──────────────────────────────────
-- Aggregate scoring at the template level. Re-computed by the batch
-- cron from content_scores + events + renders. UPSERT on conflict makes
-- the job idempotent.
CREATE TABLE IF NOT EXISTS template_scores (
  template            TEXT PRIMARY KEY,
  -- Average viral_score across this template's completed renders.
  avg_viral_score     NUMERIC(8,2) NOT NULL DEFAULT 0,
  -- Renders per day over the scoring window (default 7d).
  usage_frequency     NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- Retention impact: 0..1, fraction of users who used this template
  -- AND created another video within 7 days afterwards.
  retention_impact    NUMERIC(5,4) NOT NULL DEFAULT 0,
  -- Composite score 0..100 used for ranking.
  composite_score     NUMERIC(8,2) NOT NULL DEFAULT 0,
  total_renders       INTEGER NOT NULL DEFAULT 0,
  completed_renders   INTEGER NOT NULL DEFAULT 0,
  scored_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_template_scores_composite
  ON template_scores(composite_score DESC);

ALTER TABLE template_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "template_scores_public_read" ON template_scores;
CREATE POLICY "template_scores_public_read"
  ON template_scores FOR SELECT
  USING (true);

-- ── 5. user_scores output table ──────────────────────────────────────
-- Aggregate scoring per user. Used by personalisation + churn.
CREATE TABLE IF NOT EXISTS user_scores (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_outputs        INTEGER NOT NULL DEFAULT 0,
  avg_viral_score      NUMERIC(8,2) NOT NULL DEFAULT 0,
  credit_efficiency    NUMERIC(10,4) NOT NULL DEFAULT 0,
  -- Mirrored from user_profiles_extended.churn_risk_score for
  -- self-contained reads. Inverse contributes positively to composite.
  churn_risk_score     INTEGER NOT NULL DEFAULT 0,
  -- Composite 0..100 used for ranking creators.
  composite_score      NUMERIC(8,2) NOT NULL DEFAULT 0,
  scored_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_scores_composite
  ON user_scores(composite_score DESC);

ALTER TABLE user_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_scores_owner_read" ON user_scores;
CREATE POLICY "user_scores_owner_read"
  ON user_scores FOR SELECT
  USING (auth.uid() = user_id);

-- ── 6. Batch recalculation RPCs ─────────────────────────────────────
-- These are the ONLY functions that mutate the score tables. The cron
-- /api/cron/recalculate-scores invokes all three via supabase.rpc().
-- All three are idempotent (UPSERT-only, never insert duplicates).

-- 6a. content_scores — one row per render, derived from events.
CREATE OR REPLACE FUNCTION recalculate_content_scores(
  p_window_days INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Aggregate engagement events per render in one pass and UPSERT.
  WITH per_render_events AS (
    SELECT
      (e.payload->>'render_id')::uuid AS render_id,
      COUNT(*) FILTER (WHERE e.type = 'video_viewed')                   AS views,
      COUNT(*) FILTER (WHERE e.type = 'video_shared')                   AS shares,
      COUNT(*) FILTER (WHERE e.type = 'video_downloaded')               AS downloads,
      COUNT(*) FILTER (WHERE e.type = 'video_replayed')                 AS replays,
      COALESCE(
        AVG(NULLIF((e.payload->>'completion_rate'), '')::numeric)
        FILTER (WHERE e.type = 'video_completed'), 0
      ) AS completion_rate,
      COALESCE(
        AVG(NULLIF((e.payload->>'watch_time_seconds'), '')::numeric)
        FILTER (WHERE e.type = 'video_viewed'), 0
      ) AS watch_time_seconds
    FROM events e
    WHERE e.payload ? 'render_id'
      AND e.created_at >= now() - (p_window_days || ' days')::interval
    GROUP BY (e.payload->>'render_id')::uuid
  ),
  scored AS (
    SELECT
      pre.render_id,
      r.user_id,
      pre.views,
      pre.shares,
      pre.downloads,
      pre.replays,
      pre.completion_rate,
      pre.watch_time_seconds,
      ( 0.30 * LEAST(pre.downloads,             100)
      + 0.40 * LEAST(pre.shares,                100)
      + 0.20 * LEAST(pre.completion_rate * 100, 100)
      + 0.10 * LEAST(pre.replays,               100)
      ) AS viral_score
    FROM per_render_events pre
    JOIN renders r ON r.id = pre.render_id
  ),
  upserted AS (
    INSERT INTO content_scores (
      render_id, user_id, viral_score, views, completion_rate,
      watch_time_seconds, shares, downloads, replays, recalculated_at
    )
    SELECT
      s.render_id, s.user_id, s.viral_score, s.views, s.completion_rate,
      s.watch_time_seconds, s.shares, s.downloads, s.replays, now()
    FROM scored s
    ON CONFLICT (render_id) DO UPDATE SET
      viral_score        = EXCLUDED.viral_score,
      views              = EXCLUDED.views,
      completion_rate    = EXCLUDED.completion_rate,
      watch_time_seconds = EXCLUDED.watch_time_seconds,
      shares             = EXCLUDED.shares,
      downloads          = EXCLUDED.downloads,
      replays            = EXCLUDED.replays,
      recalculated_at    = now()
    RETURNING render_id
  )
  SELECT COUNT(*) INTO v_count FROM upserted;

  -- Push the cached integer onto renders for fast joins.
  UPDATE renders r
    SET viral_score = cs.viral_score::integer
    FROM content_scores cs
    WHERE cs.render_id = r.id
      AND r.viral_score IS DISTINCT FROM cs.viral_score::integer;

  RETURN v_count;
END;
$$;

-- 6b. template_scores — aggregate per-template metrics.
CREATE OR REPLACE FUNCTION recalculate_template_scores(
  p_window_days INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  WITH window_renders AS (
    SELECT id, template, user_id, status, viral_score, created_at
    FROM renders
    WHERE created_at >= now() - (p_window_days || ' days')::interval
      AND template IS NOT NULL
      AND template <> ''
  ),
  per_template AS (
    SELECT
      template,
      COUNT(*) AS total_renders,
      COUNT(*) FILTER (WHERE status = 'complete') AS completed_renders,
      COALESCE(AVG(viral_score) FILTER (WHERE status = 'complete'), 0)::numeric(8,2) AS avg_viral_score,
      COUNT(*)::numeric / GREATEST(p_window_days, 1)::numeric(10,2) AS usage_frequency
    FROM window_renders
    GROUP BY template
  ),
  -- Retention impact: of users who used this template, what fraction
  -- created ANOTHER render within 7 days after the first use of it?
  retention AS (
    SELECT
      t.template,
      COUNT(DISTINCT t.user_id) AS template_users,
      COUNT(DISTINCT t.user_id) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM renders r2
          WHERE r2.user_id = t.user_id
            AND r2.id <> t.id
            AND r2.created_at BETWEEN t.created_at AND t.created_at + INTERVAL '7 days'
        )
      ) AS returning_users
    FROM window_renders t
    GROUP BY t.template
  ),
  joined AS (
    SELECT
      pt.template,
      pt.avg_viral_score,
      pt.usage_frequency,
      pt.total_renders,
      pt.completed_renders,
      CASE
        WHEN COALESCE(r.template_users, 0) = 0 THEN 0
        ELSE COALESCE(r.returning_users, 0)::numeric / r.template_users
      END::numeric(5,4) AS retention_impact
    FROM per_template pt
    LEFT JOIN retention r ON r.template = pt.template
  ),
  upserted AS (
    INSERT INTO template_scores (
      template, avg_viral_score, usage_frequency, retention_impact,
      composite_score, total_renders, completed_renders, scored_at
    )
    SELECT
      template,
      avg_viral_score,
      usage_frequency,
      retention_impact,
      -- composite = 60% viral + 20% usage_freq_norm + 20% retention*100
      (0.60 * avg_viral_score
       + 0.20 * LEAST(usage_frequency * 5, 100)
       + 0.20 * retention_impact * 100)::numeric(8,2),
      total_renders,
      completed_renders,
      now()
    FROM joined
    ON CONFLICT (template) DO UPDATE SET
      avg_viral_score   = EXCLUDED.avg_viral_score,
      usage_frequency   = EXCLUDED.usage_frequency,
      retention_impact  = EXCLUDED.retention_impact,
      composite_score   = EXCLUDED.composite_score,
      total_renders     = EXCLUDED.total_renders,
      completed_renders = EXCLUDED.completed_renders,
      scored_at         = now()
    RETURNING template
  )
  SELECT COUNT(*) INTO v_count FROM upserted;

  RETURN v_count;
END;
$$;

-- 6c. user_scores — aggregate per-user metrics.
CREATE OR REPLACE FUNCTION recalculate_user_scores(
  p_window_days INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  WITH per_user_outputs AS (
    SELECT
      user_id,
      COUNT(*) FILTER (WHERE status = 'complete') AS total_outputs,
      COALESCE(AVG(viral_score) FILTER (WHERE status = 'complete'), 0)::numeric(8,2) AS avg_viral_score,
      COALESCE(SUM(credits_used) FILTER (WHERE status = 'complete'), 0) AS credits_spent
    FROM renders
    WHERE created_at >= now() - (p_window_days || ' days')::interval
      AND user_id IS NOT NULL
    GROUP BY user_id
  ),
  per_user_engagement AS (
    SELECT
      user_id,
      COUNT(*) FILTER (WHERE type IN ('video_viewed','video_shared','video_downloaded','video_replayed')) AS engagement_events
    FROM events
    WHERE created_at >= now() - (p_window_days || ' days')::interval
      AND user_id IS NOT NULL
    GROUP BY user_id
  ),
  joined AS (
    SELECT
      o.user_id,
      o.total_outputs,
      o.avg_viral_score,
      CASE
        WHEN o.credits_spent = 0 THEN 0
        ELSE (COALESCE(e.engagement_events, 0)::numeric / o.credits_spent)::numeric(10,4)
      END AS credit_efficiency,
      COALESCE(upx.churn_risk_score, 0) AS churn_risk_score
    FROM per_user_outputs o
    LEFT JOIN per_user_engagement e ON e.user_id = o.user_id
    LEFT JOIN user_profiles_extended upx ON upx.user_id = o.user_id
  ),
  upserted AS (
    INSERT INTO user_scores (
      user_id, total_outputs, avg_viral_score, credit_efficiency,
      churn_risk_score, composite_score, scored_at
    )
    SELECT
      user_id,
      total_outputs,
      avg_viral_score,
      credit_efficiency,
      churn_risk_score,
      -- composite = 50% avg viral + 30% efficiency normalised + 20% (100 - churn)
      (0.50 * avg_viral_score
       + 0.30 * LEAST(credit_efficiency * 100, 100)
       + 0.20 * (100 - churn_risk_score))::numeric(8,2),
      now()
    FROM joined
    ON CONFLICT (user_id) DO UPDATE SET
      total_outputs    = EXCLUDED.total_outputs,
      avg_viral_score  = EXCLUDED.avg_viral_score,
      credit_efficiency = EXCLUDED.credit_efficiency,
      churn_risk_score = EXCLUDED.churn_risk_score,
      composite_score  = EXCLUDED.composite_score,
      scored_at        = now()
    RETURNING user_id
  )
  SELECT COUNT(*) INTO v_count FROM upserted;

  RETURN v_count;
END;
$$;
