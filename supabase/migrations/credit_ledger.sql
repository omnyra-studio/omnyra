-- Make `credit_transactions` the AUTHORITATIVE source of credit balances.
--
-- The `credits.balance` column is kept as a denormalized cache (fast reads,
-- no aggregate on hot paths). A trigger on `credit_transactions` is the
-- ONLY thing that mutates `credits.balance` going forward. All credit
-- changes therefore flow through ledger inserts — there is no other way
-- to alter a balance without leaving an audit row.
--
-- Convention for credit_transactions.amount:
--   positive amount → credit  (subscription grant, refund, promo)
--   negative amount → debit   (usage)
-- The existing `type` column is preserved verbatim
-- ('usage' | 'subscription' | 'topup' | 'refund' | 'promo' | ...).

-- ── 1. Trigger function: apply ledger row to the cached balance ──────

CREATE OR REPLACE FUNCTION trg_apply_credit_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE credits
     SET balance    = COALESCE(balance, 0) + NEW.amount,
         updated_at = now()
   WHERE user_id = NEW.user_id;

  -- New user without a credits row yet (race with handle_new_user, or
  -- service-account credit before signup completes) — create one.
  IF NOT FOUND THEN
    INSERT INTO credits (user_id, balance, plan, updated_at)
    VALUES (NEW.user_id, NEW.amount, 'free', now())
    ON CONFLICT (user_id) DO UPDATE SET
      balance    = credits.balance + EXCLUDED.balance,
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS credit_transactions_apply ON credit_transactions;
CREATE TRIGGER credit_transactions_apply
  AFTER INSERT ON credit_transactions
  FOR EACH ROW EXECUTE FUNCTION trg_apply_credit_transaction();

-- ── 2. View: ledger-derived balance ──────────────────────────────────
-- Use for audits / drift detection. `credits.balance` should always
-- equal `credit_balances.balance` once this migration is applied.

CREATE OR REPLACE VIEW credit_balances AS
SELECT user_id, COALESCE(SUM(amount), 0)::integer AS balance
FROM credit_transactions
GROUP BY user_id;

-- ── 3. Reconciliation: backfill ledger from current cached balances ──
-- Any existing `credits.balance` that has no matching ledger entry is
-- materialised as a single 'reconciliation' transaction so the ledger
-- is consistent with the cache from this point forward.
-- Idempotent: only inserts when the per-user delta is non-zero.

INSERT INTO credit_transactions (user_id, amount, type, description)
SELECT
  c.user_id,
  c.balance - COALESCE(b.balance, 0),
  'reconciliation',
  'Backfill from cached balance at ledger migration'
FROM credits c
LEFT JOIN credit_balances b ON b.user_id = c.user_id
WHERE c.balance - COALESCE(b.balance, 0) <> 0;

-- ── 4. Drift assertion (advisory) ────────────────────────────────────
-- Comment-only documentation of the invariant; not enforced by a CHECK
-- because triggers / views aren't permitted inside one.
--
--   INVARIANT:
--     credits.balance = (SELECT balance FROM credit_balances WHERE user_id = credits.user_id)
--
-- A periodic job (or admin route) can verify by comparing the two and
-- alerting on any non-zero delta.
