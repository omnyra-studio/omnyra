-- Read-only analytics projections over the canonical event stream.
-- Use these from server routes / dashboards — they require no joins
-- beyond what's already indexed.

-- ── Top templates by completion + virality ──────────────────────────
CREATE OR REPLACE VIEW top_templates AS
SELECT
  r.template,
  COUNT(*)                                                       AS total_renders,
  COUNT(*) FILTER (WHERE r.status = 'complete')                  AS completed_renders,
  COUNT(*) FILTER (WHERE r.status = 'failed')                    AS failed_renders,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE r.status = 'complete')::numeric
    / NULLIF(COUNT(*), 0),
    2
  )                                                              AS completion_pct,
  COALESCE(AVG(r.viral_score) FILTER (WHERE r.status = 'complete'), 0)::numeric(12,2)
                                                                 AS avg_viral_score
FROM renders r
WHERE r.template IS NOT NULL AND r.template <> ''
GROUP BY r.template
ORDER BY completed_renders DESC, avg_viral_score DESC;

-- ── Daily funnel ────────────────────────────────────────────────────
-- The aggregate funnel signed_up → onboarded → brief → render → share.
-- Aggregates by UTC day; bucket by week/month upstream as needed.
CREATE OR REPLACE VIEW funnel_metrics AS
SELECT
  date_trunc('day', created_at)::date                                AS day,
  COUNT(*) FILTER (WHERE type = 'user_signed_up')                    AS signed_up,
  COUNT(*) FILTER (WHERE type = 'onboarding_completed')              AS onboarded,
  COUNT(*) FILTER (WHERE type = 'brief_created')                     AS briefs_created,
  COUNT(*) FILTER (WHERE type = 'render_requested')                  AS renders_requested,
  COUNT(*) FILTER (WHERE type = 'render_completed')                  AS renders_completed,
  COUNT(*) FILTER (WHERE type = 'video_downloaded')                  AS videos_downloaded,
  COUNT(*) FILTER (WHERE type = 'video_shared')                      AS videos_shared
FROM events
GROUP BY date_trunc('day', created_at)
ORDER BY day DESC;

-- ── Time-to-first-video per user ────────────────────────────────────
-- Distribution input for activation analysis.
CREATE OR REPLACE VIEW time_to_first_video AS
SELECT
  e.user_id,
  MIN(s.created_at)                                                  AS signed_up_at,
  MIN(c.created_at) FILTER (WHERE c.type = 'render_completed')       AS first_video_at,
  EXTRACT(EPOCH FROM (
    MIN(c.created_at) FILTER (WHERE c.type = 'render_completed')
    - MIN(s.created_at)
  ))                                                                 AS seconds_to_first_video
FROM events e
LEFT JOIN events s ON s.user_id = e.user_id AND s.type = 'user_signed_up'
LEFT JOIN events c ON c.user_id = e.user_id AND c.type = 'render_completed'
WHERE e.user_id IS NOT NULL
GROUP BY e.user_id;

-- ── Drop-off points ─────────────────────────────────────────────────
-- Users who got to stage N but never to stage N+1 in the funnel.
CREATE OR REPLACE VIEW funnel_dropoff AS
WITH per_user AS (
  SELECT
    user_id,
    BOOL_OR(type = 'user_signed_up')        AS signed_up,
    BOOL_OR(type = 'onboarding_completed')  AS onboarded,
    BOOL_OR(type = 'brief_created')         AS briefed,
    BOOL_OR(type = 'render_requested')      AS requested,
    BOOL_OR(type = 'render_completed')      AS completed,
    BOOL_OR(type = 'video_shared')          AS shared
  FROM events
  WHERE user_id IS NOT NULL
  GROUP BY user_id
)
SELECT
  COUNT(*) FILTER (WHERE signed_up AND NOT onboarded)            AS stuck_at_onboarding,
  COUNT(*) FILTER (WHERE onboarded AND NOT briefed)              AS stuck_at_brief,
  COUNT(*) FILTER (WHERE briefed AND NOT requested)              AS stuck_at_request,
  COUNT(*) FILTER (WHERE requested AND NOT completed)            AS stuck_in_render,
  COUNT(*) FILTER (WHERE completed AND NOT shared)               AS stuck_at_share
FROM per_user;
