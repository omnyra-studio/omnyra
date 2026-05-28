-- ── schema_registry emergency repair ────────────────────────────────────────
--
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query) when:
--   • app or scripts fail with: 42P01 relation "schema_registry" does not exist
--   • validate-schema throws: [SCHEMA BOOTSTRAP FAILURE]
--   • freeze-schema or check-schema exit 1 with registry errors
--
-- This script is fully idempotent. Running it multiple times is safe.
-- ────────────────────────────────────────────────────────────────────────────

-- Step 1: verify which tables currently exist
select tablename
from pg_tables
where schemaname = 'public'
order by tablename;

-- Step 2: create schema_registry (noop if already exists)
create table if not exists schema_registry (
  version    text        primary key,
  applied_at timestamptz default now()
);

-- Step 3: enable RLS (idempotent)
alter table schema_registry enable row level security;

-- Step 4: public read policy — schema_registry is infrastructure, not user data.
-- Without this policy, anon/authenticated queries silently return 0 rows.
drop policy if exists "schema_registry_public_read" on schema_registry;
create policy "schema_registry_public_read"
  on schema_registry for select
  using (true);

-- Step 5: seed canonical version (noop if already seeded)
insert into schema_registry (version)
values ('2026-05-27-01')
on conflict (version) do nothing;

-- Step 6: verify — must return exactly 1 row with a non-null version
select version, applied_at from schema_registry;
