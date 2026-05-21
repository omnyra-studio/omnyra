CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  discount_percent INTEGER DEFAULT 100,
  duration_months INTEGER DEFAULT 3,
  max_uses INTEGER DEFAULT 500,
  uses_count INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  plan TEXT DEFAULT 'creator',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active promo codes"
  ON promo_codes FOR SELECT
  USING (active = true);

INSERT INTO promo_codes (code, discount_percent, duration_months, max_uses, plan)
VALUES ('OMNYRABETA', 100, 3, 500, 'creator')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  redeemed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, code)
);

ALTER TABLE promo_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own redemptions"
  ON promo_redemptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
