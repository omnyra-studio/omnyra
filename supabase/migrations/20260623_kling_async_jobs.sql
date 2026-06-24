-- Async Kling jobs for 60s video generation.
-- Stores submitted task_ids and polls them via cron.
CREATE TABLE IF NOT EXISTS public.kling_async_jobs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'generating',  -- generating | stitching | complete | failed
  scene_count     integer     NOT NULL DEFAULT 3,
  target_duration integer     NOT NULL DEFAULT 30,
  task_ids        jsonb       NOT NULL DEFAULT '[]',   -- array of Kling task_id strings
  task_endpoints  jsonb       NOT NULL DEFAULT '[]',   -- array of endpoint paths ('/v1/videos/image2video' etc)
  main_image_url  text,
  prompts         jsonb       NOT NULL DEFAULT '[]',   -- snapshot for debugging
  audio_url       text,
  niche           text,
  video_url       text,                                 -- filled on completion
  error_msg       text,
  credit_cost     integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kling_async_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own async jobs"
  ON public.kling_async_jobs FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX kling_async_jobs_status_idx ON public.kling_async_jobs (status, created_at DESC);
CREATE INDEX kling_async_jobs_user_idx   ON public.kling_async_jobs (user_id, created_at DESC);
