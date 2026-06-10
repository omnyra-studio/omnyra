-- Backend Completion Migration — 2026-06-09
-- Idempotent (all statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- Run after all existing migrations.

-- ── 1. brand_profiles extra columns (referenced in lib/brand.ts) ──────────────

ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS logo_url     TEXT;
ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS tone_tags    TEXT[];
ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS products     JSONB DEFAULT '[]';
ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS style_preset TEXT;

-- ── 2. credit_packs — one-time purchase tracking ──────────────────────────────
-- Tracks Stripe checkout sessions for credit pack purchases.
-- credits are granted atomically in the webhook; this table is the audit trail.

CREATE TABLE IF NOT EXISTS credit_packs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_session_id TEXT        UNIQUE NOT NULL,
  pack_id           TEXT        NOT NULL,  -- 'small' | 'medium' | 'large' | 'xl'
  credits           INT         NOT NULL CHECK (credits > 0),
  amount_cents      INT,                   -- Stripe amount_total in cents
  currency          TEXT,                  -- 'aud'
  status            TEXT        NOT NULL DEFAULT 'completed'
                                CHECK (status IN ('pending', 'completed', 'refunded')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_packs_user_id
  ON credit_packs(user_id, created_at DESC);

ALTER TABLE credit_packs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_packs_owner_read" ON credit_packs;
CREATE POLICY "credit_packs_owner_read"
  ON credit_packs FOR SELECT
  USING (auth.uid() = user_id);

-- ── 3. Stripe events table (idempotent — already in 20260603_omnyra_schema.sql) ─

CREATE TABLE IF NOT EXISTS stripe_events (
  id           TEXT        PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 4. add_credits RPC — increment profiles.credits atomically ────────────────
-- Used for: credit pack grants, refunds, promo grants.
-- Updates profiles.credits (the authoritative balance for credit_reserve_atomic).

CREATE OR REPLACE FUNCTION public.add_credits(
  p_user_id UUID,
  p_amount  INT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'add_credits: p_amount must be positive, got %', p_amount;
  END IF;

  UPDATE profiles
     SET credits    = credits + p_amount,
         updated_at = now()
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'add_credits: profile not found for user_id=%', p_user_id;
  END IF;
END;
$$;

-- ── 5. Business metrics view — aggregates for Founder Dashboard ───────────────

CREATE OR REPLACE VIEW public.founder_metrics_snapshot AS
SELECT
  -- Plan distribution
  COUNT(*) FILTER (WHERE plan = 'free')    AS free_users,
  COUNT(*) FILTER (WHERE plan = 'starter') AS starter_users,
  COUNT(*) FILTER (WHERE plan = 'creator') AS creator_users,
  COUNT(*) FILTER (WHERE plan = 'studio')  AS studio_users,
  COUNT(*) FILTER (WHERE plan != 'free')   AS paid_users,
  COUNT(*)                                  AS total_users,

  -- MRR estimate (AUD) based on plan prices
  (
    COUNT(*) FILTER (WHERE plan = 'starter') * 19 +
    COUNT(*) FILTER (WHERE plan = 'creator') * 39 +
    COUNT(*) FILTER (WHERE plan = 'studio')  * 99
  )                                           AS mrr_estimate_aud,

  -- New users (last 30 days) — using profiles.created_at
  COUNT(*) FILTER (WHERE created_at > now() - interval '30 days') AS new_users_30d,
  COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')  AS new_users_7d

FROM profiles;

-- ── 6. brand_performance_log — track which brand styles perform best ──────────

CREATE TABLE IF NOT EXISTS brand_performance_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_suffix  TEXT        NOT NULL,
  provider      TEXT        NOT NULL,     -- 'kling' | 'runway' | 'hedra'
  generation_id UUID,                     -- references generation_history.id
  was_selected  BOOLEAN     NOT NULL DEFAULT false,
  generation_ms INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_perf_user
  ON brand_performance_log(user_id, created_at DESC);

ALTER TABLE brand_performance_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_perf_owner"
  ON brand_performance_log FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
