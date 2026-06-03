-- Credit reservation table — tracks in-flight video job credits.
-- Credits are deducted at reservation time and released on failure.

create table if not exists public.credit_reservations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete cascade,
  credits     int not null,
  status      text not null default 'reserved',  -- reserved | finalized | released
  created_at  timestamp default now(),
  expires_at  timestamp not null
);

create index if not exists credit_reservations_user_status
  on public.credit_reservations(user_id, status);

alter table public.credit_reservations enable row level security;

create policy "reservations_own"
  on public.credit_reservations for all
  using (auth.uid() = user_id);

-- ── Refund function (add credits back, used on reservation release) ───────────
create or replace function public.add_credits(
  p_user_id uuid,
  p_amount   int
) returns void language plpgsql security definer as $$
begin
  update public.users
    set credits_balance = credits_balance + p_amount
    where id = p_user_id;
end;
$$;

-- ── Expire stale reservations (run periodically via cron) ─────────────────────
create or replace function public.expire_credit_reservations()
returns void language plpgsql security definer as $$
declare
  r record;
begin
  for r in
    select id, user_id, credits
    from public.credit_reservations
    where status = 'reserved' and expires_at < now()
  loop
    -- Refund credits for expired reservations
    perform public.add_credits(r.user_id, r.credits);
    update public.credit_reservations
      set status = 'expired'
      where id = r.id;
  end loop;
end;
$$;
