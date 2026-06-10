-- ─────────────────────────────────────────────────────────────────────────────
-- Full RLS hardening pass (v2)
-- Idempotent — safe to re-run.
-- Covers all major tables with strict owner-only policies.
-- NOTE: Service role (supabaseAdmin) bypasses RLS — admin API routes are safe.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: is_founder() — returns true for admin/founder email.
-- Set app.admin_email via: ALTER DATABASE postgres SET app.admin_email = 'you@example.com';
-- This lets RLS policies check founder access without hardcoding UUIDs.
CREATE OR REPLACE FUNCTION public.is_founder()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND email = current_setting('app.admin_email', true)
  );
$$;

-- ── profiles ─────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_owner_select') THEN
    CREATE POLICY "profiles_owner_select" ON public.profiles FOR SELECT USING (auth.uid() = id OR is_founder());
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_owner_update') THEN
    CREATE POLICY "profiles_owner_update" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- ── renders ──────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.renders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='renders' AND policyname='renders_owner_select') THEN
    CREATE POLICY "renders_owner_select" ON public.renders FOR SELECT USING (auth.uid() = user_id OR is_founder());
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='renders' AND policyname='renders_owner_insert') THEN
    CREATE POLICY "renders_owner_insert" ON public.renders FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='renders' AND policyname='renders_owner_update') THEN
    CREATE POLICY "renders_owner_update" ON public.renders FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── credit_transactions ───────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.credit_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='credit_transactions' AND policyname='credit_txn_owner_select') THEN
    CREATE POLICY "credit_txn_owner_select" ON public.credit_transactions FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;
-- Inserts allowed from service role only (no client insert policy)

-- ── credit_packs ──────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.credit_packs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='credit_packs' AND policyname='credit_packs_owner_select') THEN
    CREATE POLICY "credit_packs_owner_select" ON public.credit_packs FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── credit_reservations ───────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.credit_reservations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='credit_reservations' AND policyname='credit_reservations_owner_select') THEN
    CREATE POLICY "credit_reservations_owner_select" ON public.credit_reservations FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── character_registry / characters ──────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'character_registry') THEN
    EXECUTE 'ALTER TABLE public.character_registry ENABLE ROW LEVEL SECURITY';
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='character_registry' AND policyname='char_registry_owner_all') THEN
      CREATE POLICY "char_registry_owner_all" ON public.character_registry FOR ALL
        USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'characters') THEN
    EXECUTE 'ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY';
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='characters' AND policyname='chars_owner_all') THEN
      CREATE POLICY "chars_owner_all" ON public.characters FOR ALL
        USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
  END IF;
END $$;

-- ── character_references ──────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.character_references ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='character_references' AND policyname='char_refs_owner_all') THEN
    CREATE POLICY "char_refs_owner_all" ON public.character_references FOR ALL
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ── generation_history ────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.generation_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='generation_history' AND policyname='gen_history_owner_select') THEN
    CREATE POLICY "gen_history_owner_select" ON public.generation_history FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── referral_codes ────────────────────────────────────────────────────────────
-- (policies already created in 20260609_referrals_and_email_cron.sql)

-- ── stripe_events (idempotency log) ──────────────────────────────────────────
ALTER TABLE IF EXISTS public.stripe_events ENABLE ROW LEVEL SECURITY;
-- No client policies — service role only

-- ── Force RLS on high-value tables ───────────────────────────────────────────
-- FORCE RLS applies RLS even to the table owner role.
ALTER TABLE IF EXISTS public.renders              FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.credit_transactions  FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.credit_packs         FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles             FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.brand_brain          FORCE ROW LEVEL SECURITY;
