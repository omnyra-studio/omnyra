-- RLS hardening pass.
--
-- The spec requires that clients NEVER write directly to:
--   - credits.balance              (only ledger trigger may mutate)
--   - credit_transactions          (server-only via supabaseAdmin)
--   - renders (mutate)             (server-only; clients can only read)
--   - viral_score on any table     (batch cron only)
--
-- This migration confirms the policies and adds explicit DENY for any
-- client INSERT/UPDATE/DELETE attempt. RLS works by ALLOWING — by
-- default, with RLS enabled and no matching policy, the operation is
-- denied. We make the deny explicit by NOT creating any client-write
-- policy, then verify here that no stray ones exist.

-- ── renders ──────────────────────────────────────────────────────────
-- Allow owner SELECT only; all writes via service_role (bypasses RLS).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'renders' AND policyname = 'Users see own renders') THEN
    DROP POLICY "Users see own renders" ON renders;
  END IF;
END $$;

CREATE POLICY "renders_owner_read"
  ON renders FOR SELECT
  USING (auth.uid() = user_id);

-- Drop any older permissive ALL policies if they existed.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'renders' AND policyname NOT IN ('renders_owner_read')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON renders', p.policyname);
  END LOOP;
END $$;

-- ── credits ──────────────────────────────────────────────────────────
-- Read-only for the owner; the cache is mutated only by the ledger
-- trigger (which runs as service_role inside trg_apply_credit_transaction).
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies WHERE tablename = 'credits'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON credits', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "credits_owner_read"
  ON credits FOR SELECT
  USING (auth.uid() = user_id);

-- ── credit_transactions ──────────────────────────────────────────────
-- Owner read-only ledger; no client writes.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies WHERE tablename = 'credit_transactions'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON credit_transactions', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "credit_transactions_owner_read"
  ON credit_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- ── content_scores ──────────────────────────────────────────────────
-- Owner read; never written by clients.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies WHERE tablename = 'content_scores'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON content_scores', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "content_scores_owner_read"
  ON content_scores FOR SELECT
  USING (auth.uid() = user_id);

-- ── render_events ────────────────────────────────────────────────────
-- Already configured in render_events_table.sql — no change needed.
-- Verify enabled:
ALTER TABLE render_events ENABLE ROW LEVEL SECURITY;

-- ── system_insights / content_performance / template_scores / user_scores ────
-- These are aggregate / internal tables. Readers handled in each
-- table's own migration. No additional client write policies exist.

-- ── Cross-cutting note ──────────────────────────────────────────────
-- Every server route that mutates state uses supabaseAdmin (service_role)
-- which BYPASSES RLS. Therefore disabling client write policies is
-- sufficient to enforce "server-side only" without losing functionality.
-- Auditable list of mutators:
--   /api/pipeline/render*           — inserts/updates renders
--   /api/auth/signup                — inserts events
--   /api/events/track               — inserts events + grants share reward
--   /api/cron/*                     — score / analytics / revenue jobs
--   lib/credits.js                  — inserts credit_transactions
--   lib/optimization/*              — inserts user_profiles_extended /
--                                     system_insights / template_settings
