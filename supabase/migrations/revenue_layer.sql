-- Revenue state — single source of truth for all monetisation decisions.
--
-- Per spec "Revenue State System":
--   - This table is the ONLY system-of-record for revenue logic.
--   - NEVER update from the client.
--   - ALL monetisation decisions must read from this table.
--   - Derived fields (churn_risk, upgrade_probability, LTV) are computed,
--     never manually edited.
--
-- A separate revenue_events table logs every offer / action for audit
-- + experimentation. Append-only.

-- ── 1. user_revenue_state ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_revenue_state (
  user_id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_tier               TEXT NOT NULL DEFAULT 'free'
                            CHECK (plan_tier IN ('free','creator','pro','studio')),
  monthly_value_score     INTEGER NOT NULL DEFAULT 0
                            CHECK (monthly_value_score BETWEEN 0 AND 1000),
  churn_risk_score        INTEGER NOT NULL DEFAULT 0
                            CHECK (churn_risk_score BETWEEN 0 AND 100),
  upgrade_probability     INTEGER NOT NULL DEFAULT 0
                            CHECK (upgrade_probability BETWEEN 0 AND 100),
  lifetime_value_estimate INTEGER NOT NULL DEFAULT 0,
  price_sensitivity       TEXT NOT NULL DEFAULT 'medium'
                            CHECK (price_sensitivity IN ('low','medium','high')),
  last_offer_type         TEXT,
  last_offer_at           TIMESTAMPTZ,
  total_spent             NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_credits_used      INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_urs_churn
  ON user_revenue_state(churn_risk_score DESC);

CREATE INDEX IF NOT EXISTS idx_urs_upgrade
  ON user_revenue_state(upgrade_probability DESC)
  WHERE plan_tier = 'free';

ALTER TABLE user_revenue_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "urs_owner_read" ON user_revenue_state;
CREATE POLICY "urs_owner_read"
  ON user_revenue_state FOR SELECT
  USING (auth.uid() = user_id);
-- No client write policy. service_role only.

-- ── 2. revenue_events ────────────────────────────────────────────────
-- Append-only log of every revenue-relevant action: offers shown,
-- offers accepted, plan changes, credit injections. Drives the A/B
-- analysis layer (out of scope here) and the safety guardrail audit.
CREATE TABLE IF NOT EXISTS revenue_events (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  -- e.g. "offer_shown" | "offer_accepted" | "plan_upgraded" |
  --      "bonus_credits_injected" | "discount_applied"
  event_type       TEXT NOT NULL,
  -- The action_type from the decision engine, when applicable.
  action_type      TEXT,
  -- Structured offer payload (plan, discount, bonus_credits, duration_days).
  offer            JSONB,
  -- For "accepted" events: links back to the originating offer event.
  source_event_id  UUID REFERENCES revenue_events(id) ON DELETE SET NULL,
  context          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revenue_events_user_time
  ON revenue_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_revenue_events_type_time
  ON revenue_events(event_type, created_at DESC);

ALTER TABLE revenue_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "revenue_events_owner_read" ON revenue_events;
CREATE POLICY "revenue_events_owner_read"
  ON revenue_events FOR SELECT
  USING (auth.uid() = user_id);

-- ── 3. updated_at trigger ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_urs_touch_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS urs_touch_updated ON user_revenue_state;
CREATE TRIGGER urs_touch_updated
  BEFORE UPDATE ON user_revenue_state
  FOR EACH ROW EXECUTE FUNCTION trg_urs_touch_updated();
