-- usage_logs: tracks every AI generation action per user
create table if not exists usage_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  action_type      text not null,
  estimated_cost_usd float,
  created_at       timestamptz not null default now()
);

-- Index for per-user queries
create index if not exists usage_logs_user_id_idx on usage_logs(user_id);
-- Index for time-range analytics
create index if not exists usage_logs_created_at_idx on usage_logs(created_at desc);

-- RLS: users can only read their own rows; inserts are service-role only
alter table usage_logs enable row level security;

create policy "Users can read own usage"
  on usage_logs for select
  using (auth.uid() = user_id);
