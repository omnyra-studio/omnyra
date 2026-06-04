const postgres = require('postgres');
const sql = postgres('postgresql://postgres.wtzqjdlcvtjunujocbst:spJ4tLOMV9TO2fsN@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres');
const results = [];

async function run(label, query) {
  try { await sql.unsafe(query); results.push({ label, status: 'OK' }); }
  catch (e) { results.push({ label, status: 'FAIL', err: e.message }); }
}

async function main() {

  // B1 — shot_plans (RLS via projects.user_id — scripts has no user_id col)
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
      auth.uid() = (SELECT user_id FROM projects WHERE id = project_id LIMIT 1)
    );
  `);

  // B2 — shots (RLS via projects.user_id)
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
      auth.uid() = (SELECT user_id FROM projects WHERE id = project_id LIMIT 1)
    );
  `);

  await sql.end();
  results.forEach(r => console.log((r.status === 'OK' ? '✓' : '✗') + ' ' + r.label + (r.err ? '\n  → ' + r.err : '')));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
