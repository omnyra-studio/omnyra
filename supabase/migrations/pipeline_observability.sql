-- Pipeline observability layer.
--
-- 1. render_pipeline_jobs   — one row per stage execution. Tracks
--    start / end / status / error. Enables crash recovery, bottleneck
--    detection, and full audit trail beyond the event stream.
-- 2. render_state_derived   — a view that derives `status` from the
--    LATEST render_events row. Per spec §7: renders.status is no
--    longer treated as authoritative; reads should prefer this view.
--
-- The events table remains the single source of truth. Jobs are
-- bookkeeping over the same execution.

-- ── 1. render_pipeline_jobs ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS render_pipeline_jobs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  render_id       UUID NOT NULL REFERENCES renders(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'generate_script' | 'generate_voice' | 'generate_video'
  -- 'generate_lipsync' | 'finalise_render'
  step            TEXT NOT NULL,
  -- 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','completed','failed','skipped')),
  -- Provider used (e.g. 'elevenlabs', 'kling', 'syncso'). Null for
  -- steps that don't have one.
  provider        TEXT,
  -- Free-form context: input keys, output URLs, etc.
  context         JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message   TEXT,
  attempt         INTEGER NOT NULL DEFAULT 1,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  -- Optimistic-concurrency lock — set when a worker picks up the job.
  -- Workers ignore rows whose lock is fresh (< 5 min).
  locked_at       TIMESTAMPTZ,
  locked_by       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composite index used by the worker to find orphans + ordering by render.
CREATE INDEX IF NOT EXISTS idx_render_pipeline_jobs_render_step
  ON render_pipeline_jobs(render_id, step, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_render_pipeline_jobs_orphans
  ON render_pipeline_jobs(status, locked_at)
  WHERE status IN ('pending','running');

ALTER TABLE render_pipeline_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "render_pipeline_jobs_owner_read" ON render_pipeline_jobs;
CREATE POLICY "render_pipeline_jobs_owner_read"
  ON render_pipeline_jobs FOR SELECT
  USING (auth.uid() = user_id);
-- Writes service_role only.

-- ── 2. render_state_derived view ─────────────────────────────────────
-- Per spec §7 — status is a function of the latest event.
-- Mapping:
--   render_finalised                                   → complete
--   render_failed                                      → failed
--   lipsync_started, lipsync_completed                 → rendering
--   motion_started, motion_completed                   → rendering
--   voice_started, voice_completed                     → rendering
--   script_generated                                   → drafting
--   render_created, brief_validated                    → queued
--   (no events)                                        → queued

CREATE OR REPLACE VIEW render_state_derived AS
SELECT
  r.id                   AS render_id,
  r.user_id,
  r.template,
  r.brief,
  r.script,
  r.video_url,
  r.audio_url,
  r.credits_used,
  r.viral_score,
  r.created_at,
  r.completed_at,
  CASE
    WHEN latest.event_type = 'render_finalised'                              THEN 'complete'
    WHEN latest.event_type = 'render_failed'                                 THEN 'failed'
    WHEN latest.event_type IN ('lipsync_started','lipsync_completed',
                               'motion_started','motion_completed',
                               'voice_started','voice_completed')            THEN 'rendering'
    WHEN latest.event_type = 'script_generated'                              THEN 'drafting'
    WHEN latest.event_type IN ('render_created','brief_validated')           THEN 'queued'
    ELSE COALESCE(r.status, 'queued')
  END                                                                        AS derived_status,
  latest.event_type                                                          AS latest_event_type,
  latest.created_at                                                          AS latest_event_at,
  -- Convenience: a UI-friendly bucket (per spec §8).
  CASE
    WHEN latest.event_type = 'render_finalised'                              THEN 'complete'
    WHEN latest.event_type = 'render_failed'                                 THEN 'failed'
    WHEN latest.event_type IN ('lipsync_started','lipsync_completed')        THEN 'finalising'
    WHEN latest.event_type IN ('motion_started','motion_completed')          THEN 'video_generating'
    WHEN latest.event_type IN ('voice_started','voice_completed')            THEN 'voice_generating'
    WHEN latest.event_type = 'script_generated'                              THEN 'script_generating'
    ELSE 'idle'
  END                                                                        AS ui_stage
FROM renders r
LEFT JOIN LATERAL (
  SELECT event_type, created_at
    FROM render_events
   WHERE render_id = r.id
   ORDER BY created_at DESC
   LIMIT 1
) latest ON TRUE;

-- ── 3. Pipeline timing diagnostic view ──────────────────────────────
-- For each render, compute per-stage duration from event timestamps.
-- Used by the admin inspector to spot slow APIs.

CREATE OR REPLACE VIEW render_stage_timings AS
WITH events_ordered AS (
  SELECT render_id, event_type, created_at,
    LAG(created_at) OVER (PARTITION BY render_id ORDER BY created_at) AS prev_at,
    LAG(event_type)  OVER (PARTITION BY render_id ORDER BY created_at) AS prev_type
  FROM render_events
)
SELECT
  e.render_id,
  e.prev_type     AS stage_started,
  e.event_type    AS stage_completed,
  e.created_at - e.prev_at AS duration
FROM events_ordered e
WHERE e.prev_at IS NOT NULL
  AND (
    (e.prev_type = 'voice_started'    AND e.event_type = 'voice_completed')   OR
    (e.prev_type = 'motion_started'   AND e.event_type = 'motion_completed')  OR
    (e.prev_type = 'lipsync_started'  AND e.event_type = 'lipsync_completed') OR
    (e.prev_type = 'render_created'   AND e.event_type = 'script_generated')
  );
