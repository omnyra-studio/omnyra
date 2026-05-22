-- Global user-event stream. Captures product telemetry for every meaningful
-- user action (signup, onboarding, brief creation, share, download, etc.).
--
-- This is intentionally SEPARATE from `render_events`:
--   - `events`         → low-volume, analytics + funnel + virality
--   - `render_events`  → high-volume, realtime UI for the render pipeline
--
-- All writes are server-side via service_role; clients are read-only.

CREATE TABLE IF NOT EXISTS events (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "(user_id, created_at)" supports per-user timelines + funnel queries.
CREATE INDEX IF NOT EXISTS idx_events_user_created
  ON events(user_id, created_at DESC);

-- "(type, created_at)" supports cohort + global metrics.
CREATE INDEX IF NOT EXISTS idx_events_type_created
  ON events(type, created_at DESC);

-- Partial GIN on payload only when the event carries a render_id, used by
-- the virality scorer to fan out from render_id → events fast.
CREATE INDEX IF NOT EXISTS idx_events_render_id
  ON events(((payload->>'render_id')))
  WHERE payload ? 'render_id';

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_owner_read" ON events;
CREATE POLICY "events_owner_read"
  ON events FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT policy: only service_role can write. Clients use server routes.
