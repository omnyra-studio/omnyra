-- Offer throttling — UX guardrail for the monetisation engine.
--
-- Per spec "Offer Throttling System":
--   Users MUST NOT receive more than:
--     - 1 monetisation offer per 24 hours
--     - 3 per 7 days
--     - 8 per month
--   HIGH CHURN RISK users: +1 extra per 48h (implemented as halved daily
--     cooldown — 12h instead of 24h — so they can receive 2 within 48h
--     without breaking the weekly cap).
--
-- This is enforced at TWO layers:
--   1. The `can_show_offer` PL/pgSQL function (called by the decision
--      engine BEFORE showing any offer)
--   2. The cooldown also lives in lib/revenue/decisions.ts as a check
--      so the engine short-circuits without a round-trip
--
-- offer_log is the canonical "this offer was shown" table. revenue_events
-- keeps the broader audit (offer_shown / offer_accepted / offer_dismissed)
-- with structured payloads; offer_log is the minimal projection used for
-- throttling.

CREATE TABLE IF NOT EXISTS offer_log (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Per spec exactly: upgrade | discount | credits | reactivation
  offer_type  TEXT NOT NULL CHECK (offer_type IN ('upgrade','discount','credits','reactivation')),
  -- Linked back to the originating revenue_events row for full audit.
  revenue_event_id UUID REFERENCES revenue_events(id) ON DELETE SET NULL,
  accepted    BOOLEAN NOT NULL DEFAULT false,
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Throttle queries always filter by (user_id, created_at). Make that
-- the primary index.
CREATE INDEX IF NOT EXISTS idx_offer_log_user_time
  ON offer_log(user_id, created_at DESC);

ALTER TABLE offer_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "offer_log_owner_read" ON offer_log;
CREATE POLICY "offer_log_owner_read"
  ON offer_log FOR SELECT
  USING (auth.uid() = user_id);
-- service_role only for writes.

-- ── can_show_offer(user_id, offer_type) ─────────────────────────────
-- Single source of truth for the rate limits. Called from:
--   - lib/revenue/decisions.ts evaluateRevenueOpportunity()
--   - POST /api/can-show-offer (for client / future surfaces)
-- Returns (allowed, reason, cooldown_remaining_seconds).

CREATE OR REPLACE FUNCTION can_show_offer(
  p_user_id    UUID,
  p_offer_type TEXT DEFAULT NULL
)
RETURNS TABLE(allowed BOOLEAN, reason TEXT, cooldown_remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_at       TIMESTAMPTZ;
  v_weekly_count  INTEGER;
  v_monthly_count INTEGER;
  v_churn_risk    INTEGER := 0;
  v_min_hours     INTEGER := 24;
  v_now           TIMESTAMPTZ := now();
BEGIN
  -- High-risk users get a tighter cooldown (12h instead of 24h) so they
  -- can receive one extra retention nudge per 48h, but the weekly /
  -- monthly caps still apply — they can't be spammed.
  SELECT churn_risk_score INTO v_churn_risk
    FROM user_revenue_state WHERE user_id = p_user_id;
  IF COALESCE(v_churn_risk, 0) >= 70 THEN
    v_min_hours := 12;
  END IF;

  -- Most recent offer regardless of type.
  SELECT MAX(created_at) INTO v_last_at FROM offer_log WHERE user_id = p_user_id;
  IF v_last_at IS NOT NULL THEN
    IF v_now - v_last_at < (v_min_hours || ' hours')::interval THEN
      allowed := FALSE;
      reason := format('cooldown_%shr', v_min_hours);
      cooldown_remaining := GREATEST(
        0,
        v_min_hours * 3600 - EXTRACT(EPOCH FROM (v_now - v_last_at))::integer
      );
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  -- 7-day cap.
  SELECT COUNT(*) INTO v_weekly_count
    FROM offer_log
    WHERE user_id = p_user_id
      AND created_at >= v_now - INTERVAL '7 days';
  IF v_weekly_count >= 3 THEN
    allowed := FALSE;
    reason := format('weekly_cap_%s', v_weekly_count);
    cooldown_remaining := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- 30-day cap.
  SELECT COUNT(*) INTO v_monthly_count
    FROM offer_log
    WHERE user_id = p_user_id
      AND created_at >= v_now - INTERVAL '30 days';
  IF v_monthly_count >= 8 THEN
    allowed := FALSE;
    reason := format('monthly_cap_%s', v_monthly_count);
    cooldown_remaining := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  allowed := TRUE;
  reason  := CASE WHEN p_offer_type IS NULL THEN 'ok' ELSE format('ok:%s', p_offer_type) END;
  cooldown_remaining := 0;
  RETURN NEXT;
END;
$$;

-- ── log_offer_shown(user_id, offer_type, revenue_event_id) ──────────
-- Convenience writer that the decision engine calls right after it
-- logs the broader revenue_event. Returns the new offer_log.id.

CREATE OR REPLACE FUNCTION log_offer_shown(
  p_user_id          UUID,
  p_offer_type       TEXT,
  p_revenue_event_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO offer_log (user_id, offer_type, revenue_event_id)
  VALUES (p_user_id, p_offer_type, p_revenue_event_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
