const postgres = require('postgres');
const sql = postgres('postgresql://postgres.wtzqjdlcvtjunujocbst:spJ4tLOMV9TO2fsN@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres');
const results = [];

async function run(label, query) {
  try { await sql.unsafe(query); results.push({ label, status: 'OK' }); }
  catch (e) { results.push({ label, status: 'FAIL', err: e.message }); }
}

async function main() {

  // F0 — renders.viral_score already added in B0a; ensure content column exists
  await run('F0: renders viral_score guard', `
    ALTER TABLE renders ADD COLUMN IF NOT EXISTS viral_score INTEGER NOT NULL DEFAULT 0;
  `);

  // F1 — content_scores (depends on renders ✓, auth.users)
  await run('F1: content_scores', `
    CREATE TABLE IF NOT EXISTS content_scores (
      render_id          UUID PRIMARY KEY REFERENCES renders(id) ON DELETE CASCADE,
      user_id            UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      viral_score        NUMERIC(12,2) NOT NULL DEFAULT 0,
      views              INTEGER       NOT NULL DEFAULT 0,
      completion_rate    NUMERIC(5,4)  NOT NULL DEFAULT 0,
      watch_time_seconds NUMERIC(12,2) NOT NULL DEFAULT 0,
      shares             INTEGER       NOT NULL DEFAULT 0,
      downloads          INTEGER       NOT NULL DEFAULT 0,
      replays            INTEGER       NOT NULL DEFAULT 0,
      recalculated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_content_scores_user_score ON content_scores(user_id, viral_score DESC);
    ALTER TABLE content_scores ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "content_scores_owner_read" ON content_scores;
    CREATE POLICY "content_scores_owner_read" ON content_scores FOR SELECT USING (auth.uid() = user_id);
  `);

  // F2 — content_performance (depends on nothing outside public schema)
  await run('F2: content_performance', `
    CREATE TABLE IF NOT EXISTS content_performance (
      template               TEXT PRIMARY KEY,
      hook_performance_score NUMERIC(6,2)  NOT NULL DEFAULT 0,
      avg_watch_time         NUMERIC(10,2) NOT NULL DEFAULT 0,
      completion_rate        NUMERIC(5,4)  NOT NULL DEFAULT 0,
      shares                 INTEGER       NOT NULL DEFAULT 0,
      downloads              INTEGER       NOT NULL DEFAULT 0,
      views                  INTEGER       NOT NULL DEFAULT 0,
      regenerate_rate        NUMERIC(5,4)  NOT NULL DEFAULT 0,
      total_renders          INTEGER       NOT NULL DEFAULT 0,
      completed_renders      INTEGER       NOT NULL DEFAULT 0,
      viral_score_velocity   NUMERIC(8,2)  NOT NULL DEFAULT 0,
      prior_score            NUMERIC(6,2)  NOT NULL DEFAULT 0,
      updated_at             TIMESTAMPTZ   NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_content_performance_score    ON content_performance(hook_performance_score DESC);
    CREATE INDEX IF NOT EXISTS idx_content_performance_velocity ON content_performance(viral_score_velocity DESC);
    ALTER TABLE content_performance ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "content_performance_public_read" ON content_performance;
    CREATE POLICY "content_performance_public_read" ON content_performance FOR SELECT USING (true);
    ALTER TABLE template_settings ADD COLUMN IF NOT EXISTS cost_multiplier NUMERIC(4,3) NOT NULL DEFAULT 1.000;
  `);

  // F3 — template_scores
  await run('F3: template_scores', `
    CREATE TABLE IF NOT EXISTS template_scores (
      template          TEXT PRIMARY KEY,
      avg_viral_score   NUMERIC(8,2)  NOT NULL DEFAULT 0,
      usage_frequency   NUMERIC(10,2) NOT NULL DEFAULT 0,
      retention_impact  NUMERIC(5,4)  NOT NULL DEFAULT 0,
      composite_score   NUMERIC(8,2)  NOT NULL DEFAULT 0,
      total_renders     INTEGER       NOT NULL DEFAULT 0,
      completed_renders INTEGER       NOT NULL DEFAULT 0,
      scored_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_template_scores_composite ON template_scores(composite_score DESC);
    ALTER TABLE template_scores ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "template_scores_public_read" ON template_scores;
    CREATE POLICY "template_scores_public_read" ON template_scores FOR SELECT USING (true);
  `);

  // F4 — user_scores (note: references auth.users; user_profiles_extended deployed in Phase G)
  await run('F4: user_scores', `
    CREATE TABLE IF NOT EXISTS user_scores (
      user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      total_outputs     INTEGER      NOT NULL DEFAULT 0,
      avg_viral_score   NUMERIC(8,2) NOT NULL DEFAULT 0,
      credit_efficiency NUMERIC(10,4) NOT NULL DEFAULT 0,
      churn_risk_score  INTEGER      NOT NULL DEFAULT 0,
      composite_score   NUMERIC(8,2) NOT NULL DEFAULT 0,
      scored_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_user_scores_composite ON user_scores(composite_score DESC);
    ALTER TABLE user_scores ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "user_scores_owner_read" ON user_scores;
    CREATE POLICY "user_scores_owner_read" ON user_scores FOR SELECT USING (auth.uid() = user_id);
  `);

  // F5 — calculate_viral_score (depends on events ✓, content_scores ✓, renders ✓)
  await run('F5: calculate_viral_score', `
    CREATE OR REPLACE FUNCTION calculate_viral_score(p_render_id UUID)
    RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      v_user UUID; v_views NUMERIC:=0; v_shares NUMERIC:=0;
      v_downloads NUMERIC:=0; v_replays NUMERIC:=0;
      v_completion NUMERIC:=0; v_watch_time NUMERIC:=0; v_score NUMERIC;
    BEGIN
      SELECT user_id INTO v_user FROM renders WHERE id = p_render_id;
      IF v_user IS NULL THEN RETURN 0; END IF;
      SELECT
        COUNT(*) FILTER (WHERE type='video_viewed'),
        COUNT(*) FILTER (WHERE type='video_shared'),
        COUNT(*) FILTER (WHERE type='video_downloaded'),
        COUNT(*) FILTER (WHERE type='video_replayed'),
        COALESCE(AVG(NULLIF((payload->>'completion_rate'),'')::numeric) FILTER (WHERE type='video_completed'),0),
        COALESCE(AVG(NULLIF((payload->>'watch_time_seconds'),'')::numeric) FILTER (WHERE type='video_viewed'),0)
      INTO v_views, v_shares, v_downloads, v_replays, v_completion, v_watch_time
      FROM events WHERE (payload->>'render_id') = p_render_id::text;
      v_score := 0.30 * LEAST(v_downloads,100)
               + 0.40 * LEAST(v_shares,100)
               + 0.20 * LEAST(v_completion*100,100)
               + 0.10 * LEAST(v_replays,100);
      INSERT INTO content_scores
        (render_id,user_id,viral_score,views,completion_rate,watch_time_seconds,shares,downloads,replays,recalculated_at)
      VALUES (p_render_id,v_user,v_score,v_views,v_completion,v_watch_time,v_shares,v_downloads,v_replays,now())
      ON CONFLICT (render_id) DO UPDATE SET
        viral_score=EXCLUDED.viral_score, views=EXCLUDED.views,
        completion_rate=EXCLUDED.completion_rate, watch_time_seconds=EXCLUDED.watch_time_seconds,
        shares=EXCLUDED.shares, downloads=EXCLUDED.downloads,
        replays=EXCLUDED.replays, recalculated_at=now();
      UPDATE renders SET viral_score=v_score::integer WHERE id=p_render_id;
      RETURN v_score;
    END; $$;
  `);

  // F6 — recalculate_content_scores (batch; depends on events ✓, renders ✓, content_scores ✓)
  await run('F6: recalculate_content_scores', `
    CREATE OR REPLACE FUNCTION recalculate_content_scores(p_window_days INTEGER DEFAULT 30)
    RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE v_count INTEGER := 0;
    BEGIN
      WITH pre AS (
        SELECT (e.payload->>'render_id')::uuid AS render_id,
          COUNT(*) FILTER (WHERE e.type='video_viewed')    AS views,
          COUNT(*) FILTER (WHERE e.type='video_shared')    AS shares,
          COUNT(*) FILTER (WHERE e.type='video_downloaded') AS downloads,
          COUNT(*) FILTER (WHERE e.type='video_replayed')  AS replays,
          COALESCE(AVG(NULLIF((e.payload->>'completion_rate'),'')::numeric) FILTER (WHERE e.type='video_completed'),0) AS completion_rate,
          COALESCE(AVG(NULLIF((e.payload->>'watch_time_seconds'),'')::numeric) FILTER (WHERE e.type='video_viewed'),0) AS watch_time_seconds
        FROM events e WHERE e.payload ? 'render_id'
          AND e.created_at >= now()-(p_window_days||' days')::interval
        GROUP BY (e.payload->>'render_id')::uuid
      ),
      scored AS (
        SELECT pre.render_id, r.user_id, pre.views, pre.shares, pre.downloads,
          pre.replays, pre.completion_rate, pre.watch_time_seconds,
          (0.30*LEAST(pre.downloads,100)+0.40*LEAST(pre.shares,100)+
           0.20*LEAST(pre.completion_rate*100,100)+0.10*LEAST(pre.replays,100)) AS viral_score
        FROM pre JOIN renders r ON r.id=pre.render_id
      ),
      ups AS (
        INSERT INTO content_scores
          (render_id,user_id,viral_score,views,completion_rate,watch_time_seconds,shares,downloads,replays,recalculated_at)
        SELECT render_id,user_id,viral_score,views,completion_rate,watch_time_seconds,shares,downloads,replays,now() FROM scored
        ON CONFLICT (render_id) DO UPDATE SET
          viral_score=EXCLUDED.viral_score, views=EXCLUDED.views,
          completion_rate=EXCLUDED.completion_rate, watch_time_seconds=EXCLUDED.watch_time_seconds,
          shares=EXCLUDED.shares, downloads=EXCLUDED.downloads,
          replays=EXCLUDED.replays, recalculated_at=now()
        RETURNING render_id
      )
      SELECT COUNT(*) INTO v_count FROM ups;
      UPDATE renders r SET viral_score=cs.viral_score::integer
        FROM content_scores cs WHERE cs.render_id=r.id AND r.viral_score IS DISTINCT FROM cs.viral_score::integer;
      RETURN v_count;
    END; $$;
  `);

  // F7 — recalculate_template_scores
  await run('F7: recalculate_template_scores', `
    CREATE OR REPLACE FUNCTION recalculate_template_scores(p_window_days INTEGER DEFAULT 30)
    RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE v_count INTEGER := 0;
    BEGIN
      WITH wr AS (
        SELECT id,template,user_id,status,viral_score,created_at FROM renders
        WHERE created_at>=now()-(p_window_days||' days')::interval AND template IS NOT NULL AND template<>''
      ),
      pt AS (
        SELECT template, COUNT(*) AS total_renders,
          COUNT(*) FILTER (WHERE status='complete') AS completed_renders,
          COALESCE(AVG(viral_score) FILTER (WHERE status='complete'),0)::numeric(8,2) AS avg_viral_score,
          COUNT(*)::numeric / GREATEST(p_window_days,1)::numeric(10,2) AS usage_frequency
        FROM wr GROUP BY template
      ),
      ret AS (
        SELECT t.template,
          COUNT(DISTINCT t.user_id) AS template_users,
          COUNT(DISTINCT t.user_id) FILTER (WHERE EXISTS (
            SELECT 1 FROM renders r2 WHERE r2.user_id=t.user_id AND r2.id<>t.id
              AND r2.created_at BETWEEN t.created_at AND t.created_at+INTERVAL '7 days'
          )) AS returning_users
        FROM wr t GROUP BY t.template
      ),
      j AS (
        SELECT pt.template, pt.avg_viral_score, pt.usage_frequency, pt.total_renders, pt.completed_renders,
          CASE WHEN COALESCE(r.template_users,0)=0 THEN 0
               ELSE COALESCE(r.returning_users,0)::numeric/r.template_users END::numeric(5,4) AS retention_impact
        FROM pt LEFT JOIN ret r ON r.template=pt.template
      ),
      ups AS (
        INSERT INTO template_scores
          (template,avg_viral_score,usage_frequency,retention_impact,composite_score,total_renders,completed_renders,scored_at)
        SELECT template,avg_viral_score,usage_frequency,retention_impact,
          (0.60*avg_viral_score+0.20*LEAST(usage_frequency*5,100)+0.20*retention_impact*100)::numeric(8,2),
          total_renders,completed_renders,now() FROM j
        ON CONFLICT (template) DO UPDATE SET
          avg_viral_score=EXCLUDED.avg_viral_score, usage_frequency=EXCLUDED.usage_frequency,
          retention_impact=EXCLUDED.retention_impact, composite_score=EXCLUDED.composite_score,
          total_renders=EXCLUDED.total_renders, completed_renders=EXCLUDED.completed_renders, scored_at=now()
        RETURNING template
      )
      SELECT COUNT(*) INTO v_count FROM ups;
      RETURN v_count;
    END; $$;
  `);

  // F8 — recalculate_user_scores (JOINs user_profiles_extended deployed in Phase G — LEFT JOIN so safe now)
  await run('F8: recalculate_user_scores', `
    CREATE OR REPLACE FUNCTION recalculate_user_scores(p_window_days INTEGER DEFAULT 30)
    RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE v_count INTEGER := 0;
    BEGIN
      WITH po AS (
        SELECT user_id,
          COUNT(*) FILTER (WHERE status='complete') AS total_outputs,
          COALESCE(AVG(viral_score) FILTER (WHERE status='complete'),0)::numeric(8,2) AS avg_viral_score,
          COALESCE(SUM(credits_used) FILTER (WHERE status='complete'),0) AS credits_spent
        FROM renders WHERE created_at>=now()-(p_window_days||' days')::interval AND user_id IS NOT NULL GROUP BY user_id
      ),
      pe AS (
        SELECT user_id, COUNT(*) FILTER (WHERE type IN ('video_viewed','video_shared','video_downloaded','video_replayed')) AS engagement_events
        FROM events WHERE created_at>=now()-(p_window_days||' days')::interval AND user_id IS NOT NULL GROUP BY user_id
      ),
      j AS (
        SELECT o.user_id, o.total_outputs, o.avg_viral_score,
          CASE WHEN o.credits_spent=0 THEN 0
               ELSE (COALESCE(e.engagement_events,0)::numeric/o.credits_spent)::numeric(10,4) END AS credit_efficiency,
          COALESCE(upx.churn_risk_score,0) AS churn_risk_score
        FROM po o LEFT JOIN pe e ON e.user_id=o.user_id
        LEFT JOIN user_profiles_extended upx ON upx.user_id=o.user_id
      ),
      ups AS (
        INSERT INTO user_scores (user_id,total_outputs,avg_viral_score,credit_efficiency,churn_risk_score,composite_score,scored_at)
        SELECT user_id,total_outputs,avg_viral_score,credit_efficiency,churn_risk_score,
          (0.50*avg_viral_score+0.30*LEAST(credit_efficiency*100,100)+0.20*(100-churn_risk_score))::numeric(8,2), now()
        FROM j
        ON CONFLICT (user_id) DO UPDATE SET
          total_outputs=EXCLUDED.total_outputs, avg_viral_score=EXCLUDED.avg_viral_score,
          credit_efficiency=EXCLUDED.credit_efficiency, churn_risk_score=EXCLUDED.churn_risk_score,
          composite_score=EXCLUDED.composite_score, scored_at=now()
        RETURNING user_id
      )
      SELECT COUNT(*) INTO v_count FROM ups;
      RETURN v_count;
    END; $$;
  `);

  await sql.end();
  results.forEach(r => console.log((r.status === 'OK' ? '✓' : '✗') + ' ' + r.label + (r.err ? '\n  → ' + r.err : '')));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
