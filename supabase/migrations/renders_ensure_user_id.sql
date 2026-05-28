-- Safe repair migration: ensure renders.user_id exists.
--
-- Root cause: renders table was created in production without user_id
-- (setup.sql did not include renders; create_renders_table.sql may not
-- have been applied). All application queries and RLS policies require
-- this column. This migration is fully idempotent.

-- ── 1. Add user_id column if missing ────────────────────────────────────────
ALTER TABLE renders
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── 2. Recreate ownership index (noop if already exists) ────────────────────
CREATE INDEX IF NOT EXISTS idx_renders_user_status
  ON renders(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_renders_user_updated
  ON renders(user_id, updated_at DESC);

-- ── 3. Ensure RLS is enabled ─────────────────────────────────────────────────
ALTER TABLE renders ENABLE ROW LEVEL SECURITY;

-- ── 4. Replace any legacy "all access" policy with strict owner-read-only ────
--      (owner write is via service_role which bypasses RLS)
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies WHERE tablename = 'renders'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON renders', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "renders_owner_read"
  ON renders FOR SELECT
  USING (auth.uid() = user_id);

-- ── 5. Ensure publication for realtime ──────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'renders'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE renders';
  END IF;
END $$;
