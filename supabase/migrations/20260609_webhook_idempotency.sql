-- Stripe webhook idempotency table.
-- Prevents double-credit when Stripe retries a delivery.
-- Primary key constraint on event_id causes a 23505 unique-violation on replay.
-- The webhook handler checks for this code and returns 200 without processing.

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id     TEXT        PRIMARY KEY,
  event_type   TEXT        NOT NULL DEFAULT '',
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No client access — server-side only (service_role).
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Prune events older than 30 days in a periodic job to keep the table lean.
-- CREATE INDEX IF NOT EXISTS idx_stripe_events_age ON stripe_webhook_events (processed_at);
