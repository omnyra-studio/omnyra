-- Snapshot Replay System — immutable scene state log
-- Every scene stores its ContinuitySnapshot here for replay and drift debugging.

CREATE TABLE IF NOT EXISTS snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    TEXT        NOT NULL,
  version       INTEGER     NOT NULL,
  scene_index   INTEGER     NOT NULL DEFAULT 0,
  snapshot_json JSONB       NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT snapshots_project_version_unique UNIQUE (project_id, version)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_project_id ON snapshots (project_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_version     ON snapshots (project_id, version);

-- RLS: users can only read their own snapshots (project_id = user_id for cinematic jobs)
ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_snapshots" ON snapshots
  FOR SELECT USING (project_id = auth.uid()::text);

CREATE POLICY "service_manage_snapshots" ON snapshots
  FOR ALL USING (auth.role() = 'service_role');
