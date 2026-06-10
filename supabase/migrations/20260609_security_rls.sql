-- Security RLS pass — brand_brain and tables missing strict owner policies.
-- Idempotent: safe to re-run.

-- ── brand_brain ──────────────────────────────────────────────────────────────
-- brand_brain may have been created via Supabase UI without RLS.
-- Forces RLS on and replaces any existing policies with strict owner-only rule.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'brand_brain'
  ) THEN
    EXECUTE 'ALTER TABLE brand_brain ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE tablename = 'brand_brain' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON brand_brain', p.policyname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'brand_brain'
  ) THEN
    CREATE POLICY "brand_brain_owner_all"
      ON brand_brain FOR ALL
      USING  (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── rate_limit_state ─────────────────────────────────────────────────────────
-- Written only by service_role (abuse-protection engine).
-- Clients must not read or write rate limit state.
ALTER TABLE IF EXISTS rate_limit_state ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE tablename = 'rate_limit_state' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON rate_limit_state', p.policyname);
  END LOOP;
END $$;

-- ── orchestration_events ─────────────────────────────────────────────────────
-- SSE progress events — clients read only their own events.
ALTER TABLE IF EXISTS orchestration_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orchestration_events' AND policyname = 'orch_events_owner_read'
  ) THEN
    CREATE POLICY "orch_events_owner_read"
      ON orchestration_events FOR SELECT
      USING (auth.uid()::text = correlation_id);
  END IF;
END $$;
