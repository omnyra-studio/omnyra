-- Script history table for semantic uniqueness checking via OpenAI embeddings.
-- Stores the last N scripts per user with vector embeddings (text-embedding-3-small = 1536 dims).

create extension if not exists vector;

create table if not exists public.script_history (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  script_text text        not null,
  embedding   vector(1536),
  goal        text,
  niche       text,
  created_at  timestamptz not null default now()
);

create index if not exists script_history_user_created_idx
  on public.script_history (user_id, created_at desc);

create index if not exists script_history_embedding_idx
  on public.script_history
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

alter table public.script_history enable row level security;

create policy "Users manage own script history"
  on public.script_history
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
