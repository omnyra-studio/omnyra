-- Per-template rolling performance aggregate.
--
-- `content_scores` (per-render projection) drives virality scoring at
-- the row level. `content_performance` rolls that up per template so
-- the trending feed, template auto-ranking, and dynamic pricing can
-- query in O(template_count) instead of O(renders).
--
-- The AGS cron upserts one row per template per run.

CREATE TABLE IF NOT EXISTS content_performance (
  template               TEXT PRIMARY KEY,
  -- 0..100 weighted: 30% completion, 30% shares, 20% watch_time, 20% downloads
  hook_performance_score NUMERIC(6,2) NOT NULL DEFAULT 0,
  avg_watch_time         NUMERIC(10,2) NOT NULL DEFAULT 0,
  completion_rate        NUMERIC(5,4) NOT NULL DEFAULT 0,
  shares                 INTEGER NOT NULL DEFAULT 0,
  downloads              INTEGER NOT NULL DEFAULT 0,
  views                  INTEGER NOT NULL DEFAULT 0,
  regenerate_rate        NUMERIC(5,4) NOT NULL DEFAULT 0,
  total_renders          INTEGER NOT NULL DEFAULT 0,
  completed_renders      INTEGER NOT NULL DEFAULT 0,
  -- Score velocity = current_score - prior_score. Used by trending feed.
  viral_score_velocity   NUMERIC(8,2) NOT NULL DEFAULT 0,
  -- Snapshot of the score on the prior cron run, for velocity computation.
  prior_score            NUMERIC(6,2) NOT NULL DEFAULT 0,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_performance_score
  ON content_performance(hook_performance_score DESC);

CREATE INDEX IF NOT EXISTS idx_content_performance_velocity
  ON content_performance(viral_score_velocity DESC);

ALTER TABLE content_performance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_performance_public_read" ON content_performance;
CREATE POLICY "content_performance_public_read"
  ON content_performance FOR SELECT
  USING (true);

-- ── Updated viral_score formula ───────────────────────────────────
-- Per the latest spec:
--   viral_score = 30% completion_rate + 30% shares + 20% watch_time + 20% downloads
-- We replace the prior formula (which used views at 20%).

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
    COALESCE(AVG(NULLIF((payload->>'completion_rate'), '')::numeric)
             FILTER (WHERE type = 'video_completed'), 0),
    COALESCE(AVG(NULLIF((payload->>'watch_time_seconds'), '')::numeric)
             FILTER (WHERE type = 'video_viewed'), 0)
  INTO v_views, v_shares, v_downloads, v_completion, v_watch_time
  FROM events
  WHERE (payload->>'render_id') = p_render_id::text;

  -- Components are normalised to a comparable 0..100 scale:
  --   completion_rate is already 0..1 → multiply by 100
  --   shares / downloads / views are raw counts → take min(count, 100)
  --   watch_time_seconds is averaged seconds → min(avg / 30s, 1) * 100
  -- This way each component contributes at most ~30 points.

  v_score := 0.30 * LEAST(v_completion * 100, 100)
           + 0.30 * LEAST(v_shares,    100)
           + 0.20 * LEAST(v_watch_time / 30.0 * 100, 100)
           + 0.20 * LEAST(v_downloads, 100);

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

-- ── Add cost_multiplier to template_settings ─────────────────────
-- Dynamic pricing control surface. 1.00 = default cost; >1.0 increases
-- credit cost for that template (used for low-performers to suppress
-- demand); <1.0 discounts (used to incentivise high-performers).
-- Bounded 0.5..2.0 application-side to prevent runaway pricing.
ALTER TABLE template_settings
  ADD COLUMN IF NOT EXISTS cost_multiplier NUMERIC(4,3) NOT NULL DEFAULT 1.000;
