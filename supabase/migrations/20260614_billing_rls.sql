-- ══════════════════════════════════════════════════════════════════════════════
-- Billing RLS Hardening + Overspend Prevention
-- 20260614_billing_rls.sql
-- ══════════════════════════════════════════════════════════════════════════════

-- ── credits table ──────────────────────────────────────────────────────────────
-- Users can only read their own balance. Only service role can write.

ALTER TABLE credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credits_select_own" ON credits;
CREATE POLICY "credits_select_own"
  ON credits FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT / UPDATE / DELETE policy for authenticated role.
-- All credit mutations go through deduct_credits_atomic / add_credits RPCs
-- (service role only), which run with SECURITY DEFINER and bypass RLS.

-- ── credit_transactions table ──────────────────────────────────────────────────
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_tx_select_own" ON credit_transactions;
CREATE POLICY "credit_tx_select_own"
  ON credit_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- ── credit_reservations table ─────────────────────────────────────────────────
ALTER TABLE credit_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_res_select_own" ON credit_reservations;
CREATE POLICY "credit_res_select_own"
  ON credit_reservations FOR SELECT
  USING (auth.uid() = user_id);

-- ── usage_logs table ───────────────────────────────────────────────────────────
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usage_logs_select_own" ON usage_logs;
CREATE POLICY "usage_logs_select_own"
  ON usage_logs FOR SELECT
  USING (auth.uid() = user_id);

-- ── profiles (plan / stripe columns) ──────────────────────────────────────────
-- Users can read their own profile. Plan changes only via webhooks (service role).

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  -- Prevent self-escalation: users cannot update their own plan tier
  WITH CHECK (
    auth.uid() = id
    AND (plan IS NOT DISTINCT FROM (SELECT plan FROM profiles WHERE id = auth.uid()))
  );

-- ── Overspend prevention: deduct_credits_atomic RPC guard ─────────────────────
-- This function is called by withCreditState. It enforces an atomic check-and-deduct.
-- Recreated here as SECURITY DEFINER to ensure it always runs as service role.

CREATE OR REPLACE FUNCTION deduct_credits_atomic(
  p_user_id  uuid,
  p_amount   integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
BEGIN
  -- Lock the row to prevent concurrent deductions
  SELECT balance INTO v_balance
  FROM credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL OR v_balance < p_amount THEN
    RETURN false;
  END IF;

  UPDATE credits
  SET balance = balance - p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  -- Audit log
  INSERT INTO credit_transactions (user_id, amount, type, description, created_at)
  VALUES (p_user_id, -p_amount, 'deduction', 'atomic deduction', now());

  RETURN true;
END;
$$;

-- ── add_credits RPC (top-up / monthly reset) ──────────────────────────────────
CREATE OR REPLACE FUNCTION add_credits(
  p_user_id  uuid,
  p_amount   integer,
  p_reason   text DEFAULT 'credit_addition'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO credits (user_id, balance, created_at, updated_at)
  VALUES (p_user_id, p_amount, now(), now())
  ON CONFLICT (user_id) DO UPDATE
    SET balance    = credits.balance + p_amount,
        updated_at = now();

  INSERT INTO credit_transactions (user_id, amount, type, description, created_at)
  VALUES (p_user_id, p_amount, 'addition', p_reason, now());
END;
$$;

-- ── Monthly credit reset function (called by pg_cron or Edge Function) ────────
CREATE OR REPLACE FUNCTION reset_monthly_credits(p_user_id uuid, p_plan text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grant integer;
BEGIN
  v_grant := CASE p_plan
    WHEN 'studio'  THEN 900
    WHEN 'creator' THEN 350
    WHEN 'starter' THEN 100
    ELSE 30  -- free
  END;

  -- Reset to plan grant (does not stack with previous balance — set, don't add)
  UPDATE credits
  SET balance    = v_grant,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO credit_transactions (user_id, amount, type, description, created_at)
  VALUES (p_user_id, v_grant, 'monthly_reset', 'Monthly credit grant for plan: ' || p_plan, now());
END;
$$;

-- Grant execute on RPCs to service role only (anon/authenticated cannot call directly)
REVOKE EXECUTE ON FUNCTION deduct_credits_atomic(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION add_credits(uuid, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reset_monthly_credits(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION deduct_credits_atomic(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION add_credits(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION reset_monthly_credits(uuid, text) TO service_role;
