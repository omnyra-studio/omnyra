-- Trend cache — stores Apify-sourced trend fingerprints per niche + platform.
-- Refreshed by scheduled cron; never written to per user request.

create table if not exists public.trend_cache (
  id         uuid primary key default gen_random_uuid(),
  niche      text not null,
  platform   text not null,
  data       jsonb not null default '{}',
  updated_at timestamp default now(),
  unique (niche, platform)
);

create index if not exists trend_cache_niche_platform
  on public.trend_cache(niche, platform);

-- Read-only for authenticated users; writes via service role (cron only)
alter table public.trend_cache enable row level security;

create policy "trend_cache_read"
  on public.trend_cache for select
  using (auth.uid() is not null);
