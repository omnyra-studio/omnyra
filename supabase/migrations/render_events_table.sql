-- Event-sourced render pipeline.
-- Every pipeline step writes a row here; the client subscribes to this
-- table (NOT renders) and derives UI state from the event stream.

CREATE TABLE IF NOT EXISTS render_events (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  render_id   UUID NOT NULL REFERENCES renders(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  payload     JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_render_events_render_id_created
  ON render_events(render_id, created_at);

ALTER TABLE render_events ENABLE ROW LEVEL SECURITY;

-- Owners can read their own render's events. Writes only from service_role.
DROP POLICY IF EXISTS "render_events_owner_read" ON render_events;
CREATE POLICY "render_events_owner_read"
  ON render_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM renders
      WHERE renders.id = render_events.render_id
        AND renders.user_id = auth.uid()
    )
  );

-- Enable realtime on the events stream so client subscriptions work.
-- (Supabase requires the publication to include the table.)
ALTER PUBLICATION supabase_realtime ADD TABLE render_events;
