CREATE TABLE renders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  script TEXT,
  audio_url TEXT,
  video_url TEXT,
  director_settings JSONB,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE renders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own renders" ON renders
  FOR ALL USING (auth.uid() = user_id);
