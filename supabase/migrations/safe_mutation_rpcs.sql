-- Atomic mutation RPCs.
--
-- Per the "Safe Data Mutation Rules" spec rule 5:
--   "ALL multi-step updates must be atomic:
--      - credit deduction + render creation
--      - status update + event insertion"
--
-- These PL/pgSQL functions wrap each multi-step mutation in a single
-- transaction. They use SELECT … FOR UPDATE to lock the target row,
-- so concurrent calls cannot race-condition the balance / status.
-- All functions are SECURITY DEFINER so the trigger machinery + RLS
-- behave consistently regardless of caller.

-- ── 1. try_deduct_credits ────────────────────────────────────────────
-- Atomically: lock credits row → check sufficient balance → insert a
-- negative credit_transactions row. The existing ledger trigger
-- (trg_apply_credit_transaction) updates credits.balance from the
-- inserted ledger row, all within this transaction.
--
-- Returns (ok BOOL, new_balance INT, reason TEXT). Callers MUST check
-- `ok`; on failure no rows are written.

CREATE OR REPLACE FUNCTION try_deduct_credits(
  p_user_id     UUID,
  p_amount      INTEGER,
  p_type        TEXT DEFAULT 'usage',
  p_description TEXT DEFAULT NULL
)
RETURNS TABLE(ok BOOLEAN, new_balance INTEGER, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    ok := FALSE; new_balance := 0; reason := 'invalid_amount';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Row lock: blocks any concurrent deduction for the same user until
  -- this transaction commits. Prevents the classic "two reads see
  -- enough balance, both deduct" race.
  SELECT balance INTO v_balance
    FROM credits
   WHERE user_id = p_user_id
   FOR UPDATE;

  IF v_balance IS NULL THEN
    ok := FALSE; new_balance := 0; reason := 'no_credit_row';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_balance < p_amount THEN
    ok := FALSE; new_balance := v_balance; reason := 'insufficient_credits';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Single ledger insert. The trigger applies it to credits.balance.
  INSERT INTO credit_transactions (user_id, amount, type, description)
  VALUES (p_user_id, -p_amount, p_type, p_description);

  ok := TRUE; new_balance := v_balance - p_amount; reason := 'ok';
  RETURN NEXT;
END;
$$;

-- ── 2. grant_credits_atomic ──────────────────────────────────────────
-- Atomic credit grant (positive ledger insert). For routes that need
-- the new balance returned in one round-trip (promo redeem, share
-- bonus, retention intervention). Internally identical to inserting
-- into credit_transactions; the helper just returns the resulting
-- balance.

CREATE OR REPLACE FUNCTION grant_credits_atomic(
  p_user_id     UUID,
  p_amount      INTEGER,
  p_type        TEXT,
  p_description TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  INSERT INTO credit_transactions (user_id, amount, type, description)
  VALUES (p_user_id, p_amount, p_type, p_description);

  SELECT balance INTO v_new_balance FROM credits WHERE user_id = p_user_id;
  RETURN COALESCE(v_new_balance, p_amount);
END;
$$;

-- ── 3. finalize_render ───────────────────────────────────────────────
-- Atomic "complete a render": verify ownership + current status,
-- transition to complete (state machine validates), set video_url +
-- credits_used + completed_at, deduct credits via the ledger, and
-- emit render_events. All in one transaction.
--
-- If any step fails the whole transaction rolls back. There is no way
-- for the system to end up with "credits deducted but status not
-- complete" or vice versa.

CREATE OR REPLACE FUNCTION finalize_render(
  p_render_id          UUID,
  p_user_id            UUID,
  p_video_url          TEXT,
  p_credits_required   INTEGER
)
RETURNS TABLE(ok BOOLEAN, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner          UUID;
  v_status         TEXT;
  v_already_paid   INTEGER;
  v_balance        INTEGER;
BEGIN
  -- Lock the render row.
  SELECT user_id, status, credits_used
    INTO v_owner, v_status, v_already_paid
    FROM renders
   WHERE id = p_render_id
   FOR UPDATE;

  IF v_owner IS NULL THEN
    ok := FALSE; reason := 'render_not_found';
    RETURN NEXT;
    RETURN;
  END IF;
  IF v_owner <> p_user_id THEN
    ok := FALSE; reason := 'forbidden';
    RETURN NEXT;
    RETURN;
  END IF;
  IF v_status NOT IN ('rendering','complete') THEN
    -- complete is permitted to allow safe re-finalisation (idempotency
    -- after a retry where the credits step succeeded but the status
    -- update didn't visible to the caller).
    ok := FALSE; reason := format('invalid_state:%s', v_status);
    RETURN NEXT;
    RETURN;
  END IF;

  -- Deduct credits only if not already deducted for this render.
  IF v_already_paid IS NULL OR v_already_paid = 0 THEN
    SELECT balance INTO v_balance FROM credits
     WHERE user_id = p_user_id FOR UPDATE;
    IF COALESCE(v_balance, 0) < p_credits_required THEN
      ok := FALSE; reason := 'insufficient_credits_at_finalize';
      RETURN NEXT;
      RETURN;
    END IF;

    INSERT INTO credit_transactions (user_id, amount, type, description)
    VALUES (p_user_id, -p_credits_required, 'usage',
            format('pipeline_render:%s', p_render_id));
  END IF;

  UPDATE renders
     SET status        = 'complete',
         video_url     = COALESCE(p_video_url, video_url),
         credits_used  = p_credits_required,
         completed_at  = now(),
         error_message = NULL,
         updated_at    = now()
   WHERE id = p_render_id;

  INSERT INTO render_events (render_id, event_type, payload)
  VALUES (p_render_id, 'render_finalised',
          jsonb_build_object('video_url', p_video_url,
                             'credits_used', p_credits_required));

  -- Global user event for analytics + revenue.
  INSERT INTO events (user_id, type, payload)
  VALUES (p_user_id, 'render_completed',
          jsonb_build_object('render_id', p_render_id,
                             'video_url', p_video_url,
                             'credits_used', p_credits_required));

  ok := TRUE; reason := 'ok';
  RETURN NEXT;
END;
$$;

-- ── 4. fail_render_atomic ────────────────────────────────────────────
-- Atomic "fail a render": verify ownership, transition to failed
-- (state machine permits from any non-complete state), set error
-- message, emit render_failed event + global event.

CREATE OR REPLACE FUNCTION fail_render_atomic(
  p_render_id     UUID,
  p_user_id       UUID,
  p_error_message TEXT,
  p_stage         TEXT DEFAULT NULL
)
RETURNS TABLE(ok BOOLEAN, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
BEGIN
  SELECT user_id INTO v_owner FROM renders WHERE id = p_render_id FOR UPDATE;
  IF v_owner IS NULL THEN
    ok := FALSE; reason := 'render_not_found';
    RETURN NEXT;
    RETURN;
  END IF;
  IF v_owner <> p_user_id THEN
    ok := FALSE; reason := 'forbidden';
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE renders
     SET status = 'failed',
         error_message = p_error_message,
         updated_at = now()
   WHERE id = p_render_id;

  INSERT INTO render_events (render_id, event_type, payload)
  VALUES (p_render_id, 'render_failed',
          jsonb_build_object('message', p_error_message, 'stage', p_stage));

  INSERT INTO events (user_id, type, payload)
  VALUES (p_user_id, 'render_failed',
          jsonb_build_object('render_id', p_render_id, 'message', p_error_message, 'stage', p_stage));

  ok := TRUE; reason := 'ok';
  RETURN NEXT;
END;
$$;
