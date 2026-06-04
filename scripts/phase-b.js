const postgres = require('postgres');
const sql = postgres('postgresql://postgres.wtzqjdlcvtjunujocbst:spJ4tLOMV9TO2fsN@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres');
const results = [];

async function run(label, query) {
  try { await sql.unsafe(query); results.push({ label, status: 'OK' }); }
  catch (e) { results.push({ label, status: 'FAIL', err: e.message }); }
}

async function main() {

  // B0a — renders schema drift
  await run('B0a: renders missing columns', `
    ALTER TABLE renders ADD COLUMN IF NOT EXISTS viral_score  INTEGER     NOT NULL DEFAULT 0;
    ALTER TABLE renders ADD COLUMN IF NOT EXISTS template     TEXT;
    ALTER TABLE renders ADD COLUMN IF NOT EXISTS credits_used INTEGER     NOT NULL DEFAULT 0;
    ALTER TABLE renders ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE renders ADD COLUMN IF NOT EXISTS brief        TEXT;
    ALTER TABLE renders ADD COLUMN IF NOT EXISTS script       TEXT;
    ALTER TABLE renders ADD COLUMN IF NOT EXISTS audio_url    TEXT;
  `);

  // B0b — set_updated_at helper (needed by scripts/shots triggers)
  await run('B0b: set_updated_at function', `
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
      NEW.updated_at := now();
      RETURN NEW;
    END;
    $$;
  `);

  // B1 — shot_plans (depends on scripts, projects — both exist)
  await run('B1: shot_plans table', `
    CREATE TABLE IF NOT EXISTS shot_plans (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      script_id  UUID NOT NULL REFERENCES scripts(id)  ON DELETE CASCADE,
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      platform   TEXT,
      motion_map JSONB NOT NULL DEFAULT '{}'::jsonb,
      status     TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','ready','rendering','complete')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_shot_plans_script_id  ON shot_plans(script_id);
    CREATE INDEX IF NOT EXISTS idx_shot_plans_project_id ON shot_plans(project_id);
    ALTER TABLE shot_plans ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "shot_plans_owner_all" ON shot_plans;
    CREATE POLICY "shot_plans_owner_all" ON shot_plans FOR ALL USING (
      auth.uid() = (SELECT user_id FROM scripts WHERE id = script_id LIMIT 1)
    );
  `);

  // B2 — shots (depends on shot_plans, scripts, projects)
  await run('B2: shots table', `
    CREATE TABLE IF NOT EXISTS shots (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shot_plan_id        UUID NOT NULL REFERENCES shot_plans(id) ON DELETE CASCADE,
      script_id           UUID NOT NULL REFERENCES scripts(id)    ON DELETE CASCADE,
      project_id          UUID NOT NULL REFERENCES projects(id)   ON DELETE CASCADE,
      shot_id             TEXT    NOT NULL,
      shot_number         INTEGER NOT NULL,
      attention_function  TEXT    NOT NULL CHECK (attention_function IN (
                            'pattern_interrupt','curiosity_spike','trust_grounding',
                            'tension_escalation','emotional_release','desire_activation',
                            'urgency_trigger','pacing_reset')),
      purpose_rationale   TEXT  NOT NULL,
      duration_seconds    FLOAT NOT NULL,
      energy_curve        TEXT  NOT NULL CHECK (energy_curve IN ('spike','ramp_up','ramp_down','sustain','pulse')),
      camera_behavior     TEXT  NOT NULL CHECK (camera_behavior IN (
                            'static','slow_push_in','dolly_in','handheld_drift',
                            'crane_up','whip_pan','orbital_slow')),
      motion_intensity    FLOAT NOT NULL CHECK (motion_intensity BETWEEN 0.0 AND 1.0),
      framing             TEXT  NOT NULL CHECK (framing IN (
                            'extreme_closeup','closeup','medium_closeup','medium','wide')),
      content_type        TEXT  NOT NULL CHECK (content_type IN ('avatar','broll','text_overlay','transition')),
      visual_prompt       TEXT  NOT NULL,
      render_assignment   TEXT  NOT NULL CHECK (render_assignment IN ('avatar','fal')),
      fal_model           TEXT,
      transition_in       TEXT  NOT NULL CHECK (transition_in IN (
                            'hard_cut','soft_dissolve','whip_blur','light_streak')),
      transition_duration FLOAT NOT NULL DEFAULT 0.0,
      audio_intent        TEXT  NOT NULL,
      fatigue_risk        FLOAT NOT NULL CHECK (fatigue_risk BETWEEN 0.0 AND 1.0),
      render_job_id       UUID,
      render_status       TEXT DEFAULT 'pending'
                            CHECK (render_status IN ('pending','rendering','completed','failed')),
      render_url          TEXT,
      clip_url            TEXT,
      render_error        TEXT,
      avatar_motion       JSONB,
      fal_render_params   JSONB,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_shots_shot_plan_id ON shots(shot_plan_id);
    CREATE INDEX IF NOT EXISTS idx_shots_project_id   ON shots(project_id);
    CREATE INDEX IF NOT EXISTS idx_shots_shot_number  ON shots(shot_plan_id, shot_number);
    ALTER TABLE shots ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "shots_owner_all" ON shots;
    CREATE POLICY "shots_owner_all" ON shots FOR ALL USING (
      auth.uid() = (SELECT user_id FROM scripts WHERE id = script_id LIMIT 1)
    );
  `);

  // B3 — render_jobs
  await run('B3: render_jobs table', `
    CREATE TABLE IF NOT EXISTS render_jobs (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      plan_id         UUID NOT NULL,
      status          TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued','rendering','composing','completed','failed')),
      total_shots     INT  NOT NULL DEFAULT 0,
      completed_shots INT  NOT NULL DEFAULT 0,
      failed_shots    INT  NOT NULL DEFAULT 0,
      voiceover_url   TEXT,
      video_url       TEXT,
      error_message   TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at    TIMESTAMPTZ
    );
    ALTER TABLE render_jobs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "render_jobs_owner" ON render_jobs;
    CREATE POLICY "render_jobs_owner" ON render_jobs FOR ALL USING (auth.uid() = user_id);
    CREATE INDEX IF NOT EXISTS render_jobs_user_status_idx ON render_jobs(user_id, status);
  `);

  // B4 — render_pipeline_jobs (depends on renders ✓, auth.users)
  await run('B4: render_pipeline_jobs table', `
    CREATE TABLE IF NOT EXISTS render_pipeline_jobs (
      id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      render_id     UUID NOT NULL REFERENCES renders(id)     ON DELETE CASCADE,
      user_id       UUID NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
      step          TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','running','completed','failed','skipped')),
      provider      TEXT,
      context       JSONB NOT NULL DEFAULT '{}'::jsonb,
      error_message TEXT,
      attempt       INTEGER NOT NULL DEFAULT 1,
      started_at    TIMESTAMPTZ,
      completed_at  TIMESTAMPTZ,
      locked_at     TIMESTAMPTZ,
      locked_by     TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_render_pipeline_jobs_render_step
      ON render_pipeline_jobs(render_id, step, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_render_pipeline_jobs_orphans
      ON render_pipeline_jobs(status, locked_at) WHERE status IN ('pending','running');
    ALTER TABLE render_pipeline_jobs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "render_pipeline_jobs_owner_read" ON render_pipeline_jobs;
    CREATE POLICY "render_pipeline_jobs_owner_read" ON render_pipeline_jobs FOR SELECT USING (auth.uid() = user_id);
  `);

  // B5 — render_state_derived + render_stage_timings views (depends on render_events ✓, renders ✓)
  await run('B5: render_state_derived view', `
    CREATE OR REPLACE VIEW render_state_derived AS
    SELECT
      r.id AS render_id, r.user_id, r.template, r.brief, r.script,
      r.video_url, r.audio_url, r.credits_used, r.viral_score,
      r.created_at, r.completed_at,
      CASE
        WHEN latest.event_type = 'render_finalised'                                    THEN 'complete'
        WHEN latest.event_type = 'render_failed'                                       THEN 'failed'
        WHEN latest.event_type IN ('lipsync_started','lipsync_completed',
                                   'motion_started','motion_completed',
                                   'voice_started','voice_completed')                  THEN 'rendering'
        WHEN latest.event_type = 'script_generated'                                    THEN 'drafting'
        WHEN latest.event_type IN ('render_created','brief_validated')                 THEN 'queued'
        ELSE COALESCE(r.status, 'queued')
      END AS derived_status,
      latest.event_type AS latest_event_type,
      latest.created_at AS latest_event_at,
      CASE
        WHEN latest.event_type = 'render_finalised'                                    THEN 'complete'
        WHEN latest.event_type = 'render_failed'                                       THEN 'failed'
        WHEN latest.event_type IN ('lipsync_started','lipsync_completed')              THEN 'finalising'
        WHEN latest.event_type IN ('motion_started','motion_completed')                THEN 'video_generating'
        WHEN latest.event_type IN ('voice_started','voice_completed')                  THEN 'voice_generating'
        WHEN latest.event_type = 'script_generated'                                    THEN 'script_generating'
        ELSE 'idle'
      END AS ui_stage
    FROM renders r
    LEFT JOIN LATERAL (
      SELECT event_type, created_at FROM render_events WHERE render_id = r.id ORDER BY created_at DESC LIMIT 1
    ) latest ON TRUE;
  `);

  await run('B5: render_stage_timings view', `
    CREATE OR REPLACE VIEW render_stage_timings AS
    WITH events_ordered AS (
      SELECT render_id, event_type, created_at,
        LAG(created_at) OVER (PARTITION BY render_id ORDER BY created_at) AS prev_at,
        LAG(event_type) OVER (PARTITION BY render_id ORDER BY created_at) AS prev_type
      FROM render_events
    )
    SELECT e.render_id,
           e.prev_type  AS stage_started,
           e.event_type AS stage_completed,
           e.created_at - e.prev_at AS duration
    FROM events_ordered e
    WHERE e.prev_at IS NOT NULL
      AND ((e.prev_type = 'voice_started'   AND e.event_type = 'voice_completed')   OR
           (e.prev_type = 'motion_started'  AND e.event_type = 'motion_completed')  OR
           (e.prev_type = 'lipsync_started' AND e.event_type = 'lipsync_completed') OR
           (e.prev_type = 'render_created'  AND e.event_type = 'script_generated'));
  `);

  await sql.end();
  results.forEach(r => console.log((r.status === 'OK' ? '✓' : '✗') + ' ' + r.label + (r.err ? '\n  → ' + r.err : '')));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
