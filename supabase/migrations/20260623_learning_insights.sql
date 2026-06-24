-- Learning insights table — stores self-improvement rules produced by the
-- learning agent cron (POST /api/cron/improve-prompts).

create table if not exists public.learning_insights (
  id          uuid primary key default gen_random_uuid(),
  date_key    text not null unique,  -- "2026-06-23"
  input_summary jsonb not null default '{}',
  rules       jsonb not null default '[]',
  render_count int not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.learning_insights enable row level security;
-- Only service_role can read/write — these are internal analytics
create policy "learning_insights: service_role only"
  on public.learning_insights for all
  using (false)  -- deny all; service_role bypasses RLS
  with check (false);
