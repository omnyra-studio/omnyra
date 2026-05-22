-- Server-controlled template settings.
--
-- Lets the AGS engine soft-mutate template visibility / ordering /
-- "recommended" status WITHOUT shipping a code change. All writes are
-- gradual and reversible — flipping `hidden=true` is one row update;
-- reverting is another.
--
-- Templates not present in this table are assumed visible with
-- default ordering (the lib/templates.ts list order).

CREATE TABLE IF NOT EXISTS template_settings (
  template          TEXT PRIMARY KEY,
  visible           BOOLEAN NOT NULL DEFAULT true,
  -- Lower numbers sort first. NULL = use default order from code.
  display_order     INTEGER,
  -- "Recommended" badge in UI.
  recommended       BOOLEAN NOT NULL DEFAULT false,
  -- Why the AGS made the last change; references system_insights.id.
  last_change_reason UUID REFERENCES system_insights(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE template_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "template_settings_public_read" ON template_settings;
CREATE POLICY "template_settings_public_read"
  ON template_settings FOR SELECT
  USING (true);
-- All authenticated users can read the visibility state; only the
-- service_role can write.
