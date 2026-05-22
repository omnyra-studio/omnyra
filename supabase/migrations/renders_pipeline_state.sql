-- Single source of truth for the render lifecycle.
-- Adds the columns the server pipeline needs to drive client UI via realtime.

ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS template        TEXT,
  ADD COLUMN IF NOT EXISTS brief           JSONB,
  ADD COLUMN IF NOT EXISTS scenes          JSONB,
  ADD COLUMN IF NOT EXISTS voice_id        TEXT,
  ADD COLUMN IF NOT EXISTS credits_used    INTEGER,
  ADD COLUMN IF NOT EXISTS error_message   TEXT,
  ADD COLUMN IF NOT EXISTS approved_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT now();

-- Canonical status values:
--   draft → processing → voice_done → motion_done → lipsync_done → complete
--   ↳ failed (terminal, transitionable back to draft via regenerate)
-- Existing 'pending' rows remain valid but should be migrated to 'draft'.
UPDATE renders SET status = 'draft' WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_renders_user_status
  ON renders(user_id, status, created_at DESC);
