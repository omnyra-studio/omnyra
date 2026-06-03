-- Credit State Machine RPCs
-- Backs lib/credits/withCreditState.ts
-- Three-phase protocol: reserve → commit (or rollback)

-- ── Add txn_id column to credit_reservations ─────────────────────────────────

ALTER TABLE public.credit_reservations
  ADD COLUMN IF NOT EXISTS txn_id uuid UNIQUE;

CREATE INDEX IF NOT EXISTS credit_reservations_txn_id
  ON public.credit_reservations(txn_id)
  WHERE txn_id IS NOT NULL;

-- ── credit_reserve_atomic ────────────────────────────────────────────────────
-- Check balance, deduct amount, create reservation record.
-- Returns: { success, balance, plan_type }

CREATE OR REPLACE FUNCTION public.credit_reserve_atomic(
  p_user_id uuid,
  p_amount   int,
  p_txn_id   uuid
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance int;
  v_plan    text;
BEGIN
  SELECT credits_balance, plan_type
    INTO v_balance, v_plan
    FROM public.users
    WHERE id = p_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'balance', 0, 'plan_type', 'free');
  END IF;

  IF v_balance < p_amount THEN
    RETURN json_build_object('success', false, 'balance', v_balance, 'plan_type', v_plan);
  END IF;

  UPDATE public.users
    SET credits_balance = credits_balance - p_amount
    WHERE id = p_user_id;

  INSERT INTO public.credit_reservations (user_id, credits, status, txn_id, expires_at)
    VALUES (p_user_id, p_amount, 'reserved', p_txn_id, now() + interval '15 minutes');

  RETURN json_build_object('success', true, 'balance', v_balance - p_amount, 'plan_type', v_plan);
END;
$$;

-- ── credit_commit_atomic ─────────────────────────────────────────────────────
-- Mark reservation as finalized at actual cost.
-- Refunds the difference if actual_cost < reserved amount.

CREATE OR REPLACE FUNCTION public.credit_commit_atomic(
  p_txn_id      uuid,
  p_actual_cost int
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_reserved int;
  v_user_id  uuid;
  v_refund   int;
BEGIN
  SELECT credits, user_id
    INTO v_reserved, v_user_id
    FROM public.credit_reservations
    WHERE txn_id = p_txn_id AND status = 'reserved'
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit_commit_atomic: reservation not found or already settled (txn_id=%)', p_txn_id;
  END IF;

  v_refund := v_reserved - p_actual_cost;
  IF v_refund > 0 THEN
    UPDATE public.users
      SET credits_balance = credits_balance + v_refund
      WHERE id = v_user_id;
  END IF;

  UPDATE public.credit_reservations
    SET status = 'finalized'
    WHERE txn_id = p_txn_id;
END;
$$;

-- ── credit_rollback_atomic ───────────────────────────────────────────────────
-- Restore all reserved credits. Called on any pipeline failure.

CREATE OR REPLACE FUNCTION public.credit_rollback_atomic(
  p_txn_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_reserved int;
  v_user_id  uuid;
BEGIN
  SELECT credits, user_id
    INTO v_reserved, v_user_id
    FROM public.credit_reservations
    WHERE txn_id = p_txn_id AND status = 'reserved'
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit_rollback_atomic: reservation not found or already settled (txn_id=%)', p_txn_id;
  END IF;

  UPDATE public.users
    SET credits_balance = credits_balance + v_reserved
    WHERE id = v_user_id;

  UPDATE public.credit_reservations
    SET status = 'rolled_back'
    WHERE txn_id = p_txn_id;
END;
$$;
