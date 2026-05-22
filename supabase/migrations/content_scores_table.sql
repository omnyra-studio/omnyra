-- Virality scoring layer.
--
-- `content_scores` is the cached projection of engagement events per render.
-- `calculate_viral_score(render_id)` recomputes the projection from the
-- canonical `events` stream and stores the result.
-- A trigger on `events` automatically calls the function when relevant
-- event types arrive, so the system is self-updating.

-- Ensure renders has the cached viral_score column (used for fast joins
-- when ranking templates / surfaces).
ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS viral_score INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS content_scores (
  render_id           UUID PRIMARY KEY REFERENCES renders(id) ON DELETE CASCADE,
  user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  viral_score         NUMERIC(12,2) NOT NULL DEFAULT 0,
  views               INTEGER       NOT NULL DEFAULT 0,
  completion_rate     NUMERIC(5,4)  NOT NULL DEFAULT 0,
  watch_time_seconds  NUMERIC(12,2) NOT NULL DEFAULT 0,
  shares              INTEGER       NOT NULL DEFAULT 0,
  downloads           INTEGER       NOT NULL DEFAULT 0,
  recalculated_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_scores_user_score
  ON content_scores(user_id, viral_score DESC);

ALTER TABLE content_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_scores_owner_read" ON content_scores;
CREATE POLICY "content_scores_owner_read"
  ON content_scores FOR SELECT
  USING (auth.uid() = user_id);

-- ── Scoring function ────────────────────────────────────────────────
-- Score formula (from spec):
--   viral_score = (views * 0.2) + (completion_rate * 0.3) + (shares * 0.3) + (downloads * 0.2)
-- completion_rate is a 0..1 fraction in the source events; we multiply by
-- 100 inside the score so it contributes on the same order of magnitude
-- as the discrete counters.

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
    COALESCE(SUM(NULLIF((payload->>'watch_time_seconds'), '')::numeric)
             FILTER (WHERE type = 'video_viewed'), 0)
  INTO v_views, v_shares, v_downloads, v_completion, v_watch_time
  FROM events
  WHERE (payload->>'render_id') = p_render_id::text;

  v_score := (v_views * 0.2)
           + (v_completion * 0.3 * 100)
           + (v_shares * 0.3)
           + (v_downloads * 0.2);

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

  -- Keep the cached column on `renders` consistent for fast ranking.
  UPDATE renders SET viral_score = v_score::integer WHERE id = p_render_id;

  RETURN v_score;
END;
$$;

-- ── Auto-recalculation trigger ──────────────────────────────────────
-- When an engagement event arrives that carries a render_id, recompute
-- that render's score. The function is idempotent so duplicate fires are
-- safe.

CREATE OR REPLACE FUNCTION trg_recalc_viral_score()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.type IN (
       'video_viewed',
       'video_shared',
       'video_downloaded',
       'video_completed',
       'render_completed'
     )
     AND NEW.payload ? 'render_id' THEN
    PERFORM calculate_viral_score((NEW.payload->>'render_id')::uuid);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_recalc_viral_score ON events;
CREATE TRIGGER events_recalc_viral_score
  AFTER INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION trg_recalc_viral_score();
