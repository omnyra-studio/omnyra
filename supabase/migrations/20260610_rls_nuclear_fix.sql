-- ─────────────────────────────────────────────────────────────────────────────
-- RLS Nuclear Fix — 2026-06-10
-- Covers: brand_profiles (created via Supabase dashboard without RLS),
--         any other tables that slipped through earlier migrations.
-- Idempotent: ENABLE ROW LEVEL SECURITY is a no-op if already enabled.
-- Safe to run via Supabase SQL editor or supabase db push.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── brand_profiles ────────────────────────────────────────────────────────────
-- This table was created via the Supabase dashboard and has no CREATE TABLE
-- migration. It is the primary table Supabase flagged in the June 8 alert.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'brand_profiles'
  ) THEN
    EXECUTE 'ALTER TABLE public.brand_profiles ENABLE ROW LEVEL SECURITY';

    -- Drop any existing overly-permissive policies
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'brand_profiles' AND policyname = 'brand_profiles_owner_all') THEN
      EXECUTE 'DROP POLICY "brand_profiles_owner_all" ON public.brand_profiles';
    END IF;

    -- Determine the user column (try user_id, then id)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'brand_profiles' AND column_name = 'user_id'
    ) THEN
      EXECUTE 'CREATE POLICY "brand_profiles_owner_all" ON public.brand_profiles
               FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'brand_profiles' AND column_name = 'id'
    ) THEN
      EXECUTE 'CREATE POLICY "brand_profiles_owner_all" ON public.brand_profiles
               FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id)';
    END IF;
  END IF;
END $$;

-- ── Dynamic safety net ────────────────────────────────────────────────────────
-- Enable RLS on every table in the public schema that still has it disabled.
-- This catches any tables created via the dashboard or in migrations that
-- somehow missed the ENABLE statement.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'          -- ordinary tables only
      AND c.relrowsecurity = false -- RLS not yet enabled
    ORDER BY c.relname
  LOOP
    RAISE NOTICE 'Enabling RLS on table: %', r.tablename;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- ── Verification query ────────────────────────────────────────────────────────
-- Run this SELECT after applying the migration to confirm zero tables remain:
--
-- SELECT relname AS table_name
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND c.relkind = 'r'
--   AND c.relrowsecurity = false
-- ORDER BY relname;
--
-- Expected result: 0 rows.
