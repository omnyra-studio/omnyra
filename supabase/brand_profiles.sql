-- Brand profiles table (run in Supabase SQL editor if not already created)
-- Dashboard: supabase.com → project → SQL Editor → paste & run

CREATE TABLE IF NOT EXISTS brand_profiles (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  brand_name      TEXT,
  tagline         TEXT,
  niche           TEXT,
  target_audience TEXT,
  tone_of_voice   TEXT,
  colors          TEXT[]      DEFAULT '{}',
  content_style_notes TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE brand_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own brand profile" ON brand_profiles;
CREATE POLICY "Users can manage their own brand profile"
  ON brand_profiles FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
