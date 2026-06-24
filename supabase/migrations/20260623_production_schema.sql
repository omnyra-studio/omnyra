-- Production schema: projects, story_state, scenes, renders
-- Applied: 2026-06-23

-- ── projects ──────────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  niche         text not null default 'lifestyle',
  status        text not null default 'draft'
                  check (status in ('draft', 'compiling', 'rendering', 'stitching', 'done', 'failed')),
  target_duration int not null default 30,
  aspect_ratio  text not null default '9:16',
  scene_count   int not null default 3,
  credit_cost   int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects(user_id);
alter table public.projects enable row level security;
create policy "projects: user owns row"
  on public.projects for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── story_state ───────────────────────────────────────────────────────────────
create table if not exists public.story_state (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  current_arc     text not null default 'challenge → effort → resolution',
  current_emotion text not null default 'neutral',
  current_tension real not null default 0.5,
  last_event      text,
  active_objects  text[] not null default '{}',
  scene_index     int not null default 0,
  lighting_vector text,
  camera_vector   text,
  updated_at      timestamptz not null default now()
);

create unique index if not exists story_state_project_id_idx on public.story_state(project_id);
alter table public.story_state enable row level security;
create policy "story_state: user owns row"
  on public.story_state for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── scenes ────────────────────────────────────────────────────────────────────
create table if not exists public.scenes (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  scene_index     int not null,
  narrative_role  text not null default 'development',
  image_prompt    text,
  video_prompt    text not null,
  negative_prompt text,
  scene_state     jsonb,
  camera_state    jsonb,
  character_state jsonb,
  status          text not null default 'pending'
                    check (status in ('pending', 'generating', 'done', 'failed')),
  first_frame_anchor text,
  video_url       text,
  generation_ms   int,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (project_id, scene_index)
);

create index if not exists scenes_project_id_idx on public.scenes(project_id);
alter table public.scenes enable row level security;
create policy "scenes: user owns row"
  on public.scenes for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── renders (project-level stitched output) ───────────────────────────────────
-- Note: per-scene render jobs use the scenes table above.
-- This table tracks the final stitched video for a project.
create table if not exists public.project_renders (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'pending'
                    check (status in ('pending', 'stitching', 'done', 'failed')),
  video_url       text,
  audio_url       text,
  thumbnail_url   text,
  duration_secs   int,
  credit_cost     int,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists project_renders_project_id_idx on public.project_renders(project_id);
alter table public.project_renders enable row level security;
create policy "project_renders: user owns row"
  on public.project_renders for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── auto-update updated_at ───────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'projects_touch_updated_at') then
    create trigger projects_touch_updated_at
      before update on public.projects
      for each row execute function public.touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'story_state_touch_updated_at') then
    create trigger story_state_touch_updated_at
      before update on public.story_state
      for each row execute function public.touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'scenes_touch_updated_at') then
    create trigger scenes_touch_updated_at
      before update on public.scenes
      for each row execute function public.touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'project_renders_touch_updated_at') then
    create trigger project_renders_touch_updated_at
      before update on public.project_renders
      for each row execute function public.touch_updated_at();
  end if;
end $$;
