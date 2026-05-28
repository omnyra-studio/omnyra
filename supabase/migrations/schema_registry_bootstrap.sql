-- ── Schema registry bootstrap repair ────────────────────────────────────────
--
-- Fixes:
--   1. Creates the table if it was never applied from setup.sql
--   2. Enables RLS (consistent with all other tables)
--   3. Adds a public-read policy (schema_registry is infrastructure,
--      not user data — no row-level isolation needed)
--   4. Seeds the canonical version if the table is empty
--
-- This migration is fully idempotent. Run it whenever schema_registry
-- returns 0 rows or queries fail silently.

-- ── 1. Table (idempotent) ────────────────────────────────────────────────────
create table if not exists schema_registry (
  version    text        primary key,
  applied_at timestamptz default now()
);

-- ── 2. RLS ───────────────────────────────────────────────────────────────────
alter table schema_registry enable row level security;

-- Remove any stale policies first to prevent duplicates
drop policy if exists "schema_registry_public_read" on schema_registry;

-- schema_registry is infrastructure — all authenticated and anon roles may SELECT.
-- Writes are service-role only (no INSERT/UPDATE/DELETE policy = blocked by RLS).
create policy "schema_registry_public_read"
  on schema_registry for select
  using (true);

-- ── 3. Seed canonical version ────────────────────────────────────────────────
insert into schema_registry (version)
values ('2026-05-27-01')
on conflict (version) do nothing;
