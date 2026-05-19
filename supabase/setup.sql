-- ============================================================
-- Omnyra AI — Supabase setup
-- Run this once in the Supabase SQL editor (Dashboard → SQL)
-- ============================================================


-- ── 1. Profiles extras (Stripe columns) ──────────────────────
alter table profiles
  add column if not exists plan                  text not null default 'free',
  add column if not exists stripe_customer_id    text,
  add column if not exists stripe_subscription_id text;

create index if not exists profiles_stripe_customer_id_idx
  on profiles (stripe_customer_id);


-- ── 2. Credits table ─────────────────────────────────────────
create table if not exists credits (
  id         uuid        default gen_random_uuid() primary key,
  user_id    uuid        not null unique references auth.users(id) on delete cascade,
  balance    integer     not null default 50,
  plan       text        not null default 'free',
  updated_at timestamptz default now()
);

alter table credits enable row level security;

drop policy if exists "Users can read their own credits" on credits;
create policy "Users can read their own credits"
  on credits for select
  using (auth.uid() = user_id);


-- ── 3. Credit transactions table ─────────────────────────────
create table if not exists credit_transactions (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  amount      integer     not null,
  type        text        not null, -- 'usage' | 'subscription' | 'topup'
  description text,
  created_at  timestamptz default now()
);

alter table credit_transactions enable row level security;

drop policy if exists "Users can read their own transactions" on credit_transactions;
create policy "Users can read their own transactions"
  on credit_transactions for select
  using (auth.uid() = user_id);


-- ── 4. Auto-create credits row when a new user signs up ──────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Create profile row
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  -- Create credits row with free-tier balance
  insert into public.credits (user_id, balance, plan)
  values (new.id, 50, 'free')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── 5. Brand profiles table ──────────────────────────────────
create table if not exists brand_profiles (
  id              uuid        default gen_random_uuid() primary key,
  user_id         uuid        not null unique references auth.users(id) on delete cascade,
  brand_name      text,
  colors          jsonb       default '[]'::jsonb,
  tone_of_voice   text,
  target_audience text,
  niche           text,
  updated_at      timestamptz default now()
);

alter table brand_profiles enable row level security;

drop policy if exists "Users can manage their own brand profile" on brand_profiles;
create policy "Users can manage their own brand profile"
  on brand_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Migration: extend brand_profiles with tagline and content style notes
alter table brand_profiles add column if not exists tagline             text;
alter table brand_profiles add column if not exists content_style_notes text;


-- ── 6. Seed credits for any existing users ───────────────────
insert into credits (user_id, balance, plan)
select p.id, 50, coalesce(p.plan, 'free')
from profiles p
on conflict (user_id) do nothing;
