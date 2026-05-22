CREATE TABLE IF NOT EXISTS api_rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  endpoint TEXT NOT NULL,
  request_count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_user_endpoint
ON api_rate_limits(user_id, endpoint, window_start);

ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; no public policies needed. Block direct
-- client access so users cannot read or tamper with their counters.
DROP POLICY IF EXISTS "rate_limits_no_public_access" ON api_rate_limits;
CREATE POLICY "rate_limits_no_public_access"
  ON api_rate_limits FOR ALL
  USING (false)
  WITH CHECK (false);
