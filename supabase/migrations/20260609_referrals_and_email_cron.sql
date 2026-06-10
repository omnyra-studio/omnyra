-- ─────────────────────────────────────────────────────────────────────────────
-- Referral system + pg_cron email automation
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Referral codes (one per user) ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.referral_codes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code            TEXT NOT NULL UNIQUE,
  uses            INT  NOT NULL DEFAULT 0,
  credits_granted INT  NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON public.referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON public.referral_codes(user_id);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referral_codes_owner_select"
  ON public.referral_codes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "referral_codes_owner_insert"
  ON public.referral_codes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ── Referral uses (one per referee) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.referral_uses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id UUID NOT NULL REFERENCES public.referral_codes(id),
  referrer_id      UUID NOT NULL REFERENCES public.profiles(id),
  referee_id       UUID NOT NULL REFERENCES public.profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(referee_id)  -- each user can only be referred once
);

ALTER TABLE public.referral_uses ENABLE ROW LEVEL SECURITY;

-- Service-role only; no direct client access
CREATE POLICY "referral_uses_no_public"
  ON public.referral_uses FOR ALL
  USING (false)
  WITH CHECK (false);

-- ── Add first_name + last_active to profiles if not already present ──────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name    TEXT,
  ADD COLUMN IF NOT EXISTS last_active   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS referred_by   UUID REFERENCES public.profiles(id);

-- Touch last_active on profile updates
CREATE OR REPLACE FUNCTION public.update_last_active()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.last_active = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_last_active ON public.profiles;
CREATE TRIGGER trg_update_last_active
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_last_active();

-- ─────────────────────────────────────────────────────────────────────────────
-- pg_cron email automation
-- Run this block AFTER enabling pg_cron in Supabase (Dashboard → Database → Extensions)
-- Replace 'https://omnyra.studio' with your actual domain.
-- ─────────────────────────────────────────────────────────────────────────────

-- Weekly digest — every Monday 9 AM UTC
-- (fires for users active in last 30 days)
SELECT cron.schedule(
  'weekly-digest',
  '0 9 * * 1',
  $$
    SELECT net.http_post(
      url     := 'https://omnyra.studio/api/webhooks/email-triggers',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.cron_secret', true)
      ),
      body    := jsonb_build_object(
        'type',    'weekly-digest',
        'userId',  id::text,
        'secret',  current_setting('app.cron_secret', true),
        'payload', jsonb_build_object(
          'suggestion', 'Your audience loves emotional, slow-paced story arcs.'
        )
      )
    )
    FROM public.profiles
    WHERE last_active > now() - interval '30 days';
  $$
) ON CONFLICT (jobname) DO UPDATE SET schedule = '0 9 * * 1';

-- Daily low-credits check — 10 AM UTC
SELECT cron.schedule(
  'low-credits-check',
  '0 10 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://omnyra.studio/api/webhooks/email-triggers',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.cron_secret', true)
      ),
      body    := jsonb_build_object(
        'type',    'low-credits',
        'userId',  id::text,
        'secret',  current_setting('app.cron_secret', true),
        'payload', jsonb_build_object(
          'remainingCredits', credits,
          'estimatedVideos',  GREATEST(0, credits / 30)
        )
      )
    )
    FROM public.profiles
    WHERE credits < 300 AND credits > 0
      AND last_active > now() - interval '7 days';
  $$
) ON CONFLICT (jobname) DO UPDATE SET schedule = '0 10 * * *';

-- Re-engagement check — 11 AM UTC daily
SELECT cron.schedule(
  're-engagement',
  '0 11 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://omnyra.studio/api/webhooks/email-triggers',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.cron_secret', true)
      ),
      body    := jsonb_build_object(
        'type',    're-engagement',
        'userId',  p.id::text,
        'secret',  current_setting('app.cron_secret', true),
        'payload', jsonb_build_object(
          'characterName',      COALESCE(c.name, 'your character'),
          'daysSinceLastVideo', EXTRACT(day FROM now() - p.last_active)::int
        )
      )
    )
    FROM public.profiles p
    LEFT JOIN LATERAL (
      SELECT name FROM public.characters
      WHERE user_id = p.id
      ORDER BY created_at DESC
      LIMIT 1
    ) c ON TRUE
    WHERE p.last_active < now() - interval '14 days'
      AND p.last_active > now() - interval '60 days';
  $$
) ON CONFLICT (jobname) DO UPDATE SET schedule = '0 11 * * *';
