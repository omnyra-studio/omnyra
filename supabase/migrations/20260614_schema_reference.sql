-- ══════════════════════════════════════════════════════════════════════════════
-- Omnyra.studio — Schema Reference (additive / safe to re-run)
-- 20260614_schema_reference.sql
--
-- This migration adds any tables that may be missing and ensures all core
-- billing / memory / video tables exist. Existing tables are untouched.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Credits ledger ────────────────────────────────────────────────────────────
-- Single balance row per user. All mutations via deduct_credits_atomic / add_credits.

CREATE TABLE IF NOT EXISTS credits (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance    integer     NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE credits ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS credit_transactions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      integer     NOT NULL,
  type        text        NOT NULL CHECK (type IN ('deduction','addition','monthly_reset','refund')),
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transactions(user_id, created_at DESC);
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- ── Usage logs ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS usage_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text        NOT NULL,
  credits     integer     NOT NULL DEFAULT 0,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_created ON usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_action       ON usage_logs(user_id, action_type, created_at DESC);
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- ── Subscriptions ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscriptions (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id  text        UNIQUE,
  stripe_customer_id      text,
  plan                    text        NOT NULL DEFAULT 'free'
                                      CHECK (plan IN ('free','starter','creator','studio')),
  status                  text        NOT NULL DEFAULT 'active'
                                      CHECK (status IN ('active','canceled','past_due','trialing')),
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean     NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- ── Generated videos ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS generated_videos (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id          uuid        REFERENCES shot_plans(id) ON DELETE SET NULL,
  video_url        text        NOT NULL,
  voiceover_url    text,
  duration_seconds float,
  watermarked      boolean     NOT NULL DEFAULT false,
  video_type       text        NOT NULL DEFAULT 'cinematic_30s'
                               CHECK (video_type IN ('preview','cinematic_30s','avatar_30s','full_sequence_60s')),
  credits_used     integer     NOT NULL DEFAULT 0,
  plan_at_creation text,
  metadata         jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generated_videos_user ON generated_videos(user_id, created_at DESC);
ALTER TABLE generated_videos ENABLE ROW LEVEL SECURITY;

-- ── Memory store (behavioral — Ghost Test compliant) ──────────────────────────

CREATE TABLE IF NOT EXISTS creator_memory (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_type       text        NOT NULL
                                CHECK (memory_type IN (
                                  'performance_pattern','audience_insights',
                                  'character_appearance','brand_voice',
                                  'behavioral_note'
                                )),
  content           text        NOT NULL,   -- Observable behavior only (Ghost Test)
  metadata          jsonb,
  source_project_id uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_memory_user ON creator_memory(user_id, memory_type, created_at DESC);
ALTER TABLE creator_memory ENABLE ROW LEVEL SECURITY;

-- ── RLS policies ──────────────────────────────────────────────────────────────

-- credits
DROP POLICY IF EXISTS "credits_select_own" ON credits;
CREATE POLICY "credits_select_own" ON credits FOR SELECT USING (auth.uid() = user_id);

-- credit_transactions
DROP POLICY IF EXISTS "credit_tx_select_own" ON credit_transactions;
CREATE POLICY "credit_tx_select_own" ON credit_transactions FOR SELECT USING (auth.uid() = user_id);

-- usage_logs
DROP POLICY IF EXISTS "usage_logs_select_own" ON usage_logs;
CREATE POLICY "usage_logs_select_own" ON usage_logs FOR SELECT USING (auth.uid() = user_id);

-- subscriptions
DROP POLICY IF EXISTS "subscriptions_select_own" ON subscriptions;
CREATE POLICY "subscriptions_select_own" ON subscriptions FOR SELECT USING (auth.uid() = user_id);

-- generated_videos
DROP POLICY IF EXISTS "generated_videos_select_own" ON generated_videos;
CREATE POLICY "generated_videos_select_own" ON generated_videos FOR SELECT USING (auth.uid() = user_id);

-- creator_memory
DROP POLICY IF EXISTS "creator_memory_select_own" ON creator_memory;
CREATE POLICY "creator_memory_select_own" ON creator_memory FOR SELECT USING (auth.uid() = user_id);

-- ── Profile plan column (ensure it exists) ────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free'
  CHECK (plan IN ('free','starter','creator','studio'));

-- ── Monthly reset trigger ─────────────────────────────────────────────────────
-- Called by pg_cron at 00:00 on the 1st of each month.

CREATE OR REPLACE FUNCTION trigger_monthly_credit_reset()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reset credits for every user to their current plan's monthly grant.
  -- top-up credits (from credit_transactions type='addition' beyond the reset)
  -- are NOT affected — they are tracked separately and never reset.
  PERFORM reset_monthly_credits(p.id, p.plan)
  FROM profiles p
  WHERE p.plan IN ('free','starter','creator','studio');
END;
$$;

-- Schedule monthly reset (requires pg_cron extension):
-- SELECT cron.schedule('monthly-credit-reset', '0 0 1 * *', 'SELECT trigger_monthly_credit_reset()');
