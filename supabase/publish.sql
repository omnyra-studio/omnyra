-- Social platform OAuth connections
CREATE TABLE IF NOT EXISTS public.social_connections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform         TEXT NOT NULL,  -- tiktok | instagram | youtube | twitter
  platform_user_id TEXT,
  username         TEXT,
  avatar_url       TEXT,
  access_token     TEXT NOT NULL,
  refresh_token    TEXT,
  token_expires_at TIMESTAMPTZ,
  scope            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_user_platform UNIQUE (user_id, platform)
);

ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own social connections" ON public.social_connections;
CREATE POLICY "Users manage own social connections" ON public.social_connections
  FOR ALL USING (auth.uid() = user_id);

-- Scheduled / published posts
CREATE TABLE IF NOT EXISTS public.scheduled_posts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generation_id     UUID REFERENCES public.generations(id) ON DELETE SET NULL,
  title             TEXT,
  caption           TEXT,
  media_url         TEXT,
  media_type        TEXT,  -- image | video | text
  thumbnail_url     TEXT,
  platforms         JSONB NOT NULL DEFAULT '[]',
  scheduled_for     TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'draft',  -- draft | scheduled | publishing | published | failed
  platform_post_ids JSONB DEFAULT '{}',
  error_message     TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own scheduled posts" ON public.scheduled_posts;
CREATE POLICY "Users manage own scheduled posts" ON public.scheduled_posts
  FOR ALL USING (auth.uid() = user_id);

-- Fast lookup for cron job
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_due
  ON public.scheduled_posts (scheduled_for, status)
  WHERE status = 'scheduled';
