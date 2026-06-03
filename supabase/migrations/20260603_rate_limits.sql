-- Rate limit state — replaces in-memory Map for multi-instance safety.
-- Keyed by user_id. One row per user, upserted on each request check.

create table if not exists public.rate_limit_state (
  user_id               uuid primary key references public.users(id) on delete cascade,
  daily_request_count   int  not null default 0,
  daily_window_start    timestamp not null default now(),
  cooldown_until        timestamp,
  video_cooldown_until  timestamp,
  concurrent_video_jobs int  not null default 0,
  hard_flag_count       int  not null default 0,
  updated_at            timestamp not null default now()
);

-- Service role only — no client reads/writes
alter table public.rate_limit_state enable row level security;
-- No client policy: only accessible via service_role (abuse-protection.ts uses supabaseAdmin)
