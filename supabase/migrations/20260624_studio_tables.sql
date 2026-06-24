-- Studio-grade tables: versioned snapshots + render ledger
-- Applied: 2026-06-24

-- ── Continuity snapshots (append-only ledger) ─────────────────────────────────
create table if not exists public.continuity_snapshots (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  version        int  not null,
  parent_version int,
  scene_index    int  not null,
  data           jsonb not null default '{}',
  created_at     timestamptz not null default now()
);

create index if not exists idx_continuity_snapshots_project
  on public.continuity_snapshots(project_id, version);

alter table public.continuity_snapshots enable row level security;

create policy "continuity_snapshots: owner read"
  on public.continuity_snapshots for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  );

-- ── Render ledger (immutable audit trail) ────────────────────────────────────
create table if not exists public.render_ledger (
  id               uuid primary key default gen_random_uuid(),
  project_id       text not null,
  scene_id         text not null,
  snapshot_version int  not null default 0,
  prompt_hash      text not null,
  model_used       text not null,  -- 'runway' | 'kling' | 'kling-retry'
  input_frame_url  text,
  output_video_url text not null,
  drift_score      float not null default 0,
  retries          int  not null default 0,
  generation_ms    int  not null default 0,
  created_at       timestamptz not null default now()
);

create index if not exists idx_render_ledger_project
  on public.render_ledger(project_id, created_at desc);

create index if not exists idx_render_ledger_scene
  on public.render_ledger(scene_id, created_at desc);

alter table public.render_ledger enable row level security;

-- Ledger is internal analytics — service_role only
create policy "render_ledger: service_role only"
  on public.render_ledger for all
  using (false)
  with check (false);
