-- Omnyra Production Schema — v1
-- supabase db push

-- ── Users ─────────────────────────────────────────────────────────────────────
create table if not exists public.users (
  id              uuid primary key default gen_random_uuid(),
  email           text unique not null,
  created_at      timestamp default now(),
  plan_type       text not null default 'free',
  credits_balance int  not null default 40
);

-- ── Brand memory ──────────────────────────────────────────────────────────────
create table if not exists public.brand_memory (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references public.users(id) on delete cascade,
  tone_preferences    jsonb default '{}',
  niche_focus         text[] default '{}',
  content_style_rules jsonb default '{}',
  format_preferences  jsonb default '{}',
  updated_at          timestamp default now()
);

-- ── Generations ───────────────────────────────────────────────────────────────
create table if not exists public.generations (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references public.users(id) on delete cascade,
  idea                  text not null,
  niche                 text,
  platform              text,
  variants              jsonb not null,
  recommended_variant_id text,
  credits_used          int  not null default 1,
  created_at            timestamp default now()
);

create index if not exists generations_user_created
  on public.generations(user_id, created_at desc);

-- ── Variant selections ────────────────────────────────────────────────────────
create table if not exists public.variant_selections (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references public.users(id) on delete cascade,
  generation_id       uuid references public.generations(id) on delete cascade,
  selected_variant_id text not null,
  created_at          timestamp default now()
);

-- ── Session bias (temporary — client discards after session) ──────────────────
create table if not exists public.session_bias (
  session_id            text not null,
  user_id               uuid references public.users(id) on delete cascade,
  scroll_hold_bias      int default 0,
  share_potential_bias  int default 0,
  message_strength_bias int default 0,
  expires_at            timestamp not null,
  primary key (session_id, user_id)
);

-- ── Analytics events (aggregated, no PII) ────────────────────────────────────
create table if not exists public.analytics_events (
  id           uuid primary key default gen_random_uuid(),
  event_type   text not null,
  metadata     jsonb default '{}',
  created_at   timestamp default now()
);

-- ── Stripe event deduplication ────────────────────────────────────────────────
create table if not exists public.stripe_events (
  id           text primary key,
  processed_at timestamp default now()
);

-- ── Row Level Security ────────────────────────────────────────────────────────
alter table public.users              enable row level security;
alter table public.brand_memory       enable row level security;
alter table public.generations        enable row level security;
alter table public.variant_selections enable row level security;
alter table public.session_bias       enable row level security;
alter table public.analytics_events   enable row level security;
alter table public.stripe_events      enable row level security;

create policy "users_own"
  on public.users for all using (auth.uid() = id);

create policy "brand_memory_own"
  on public.brand_memory for all using (auth.uid() = user_id);

create policy "generations_own"
  on public.generations for all using (auth.uid() = user_id);

create policy "variant_selections_own"
  on public.variant_selections for all using (auth.uid() = user_id);

create policy "session_bias_own"
  on public.session_bias for all using (auth.uid() = user_id);

create policy "analytics_read"
  on public.analytics_events for select using (auth.uid() is not null);

-- stripe_events: service role only (no client policy)

-- ── Atomic credit deduction ───────────────────────────────────────────────────
create or replace function public.deduct_credits(
  p_user_id uuid,
  p_amount   int
) returns boolean language plpgsql security definer as $$
declare
  v_rows int;
begin
  update public.users
    set credits_balance = credits_balance - p_amount
    where id = p_user_id
      and credits_balance >= p_amount;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- ── Session bias cleanup ──────────────────────────────────────────────────────
create or replace function public.cleanup_expired_sessions()
returns void language plpgsql as $$
begin
  delete from public.session_bias where expires_at < now();
end;
$$;
