-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists public.trades (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date        date not null,
  time        text,
  sym         text not null,
  side        text not null check (side in ('Long', 'Short')),
  qty         float8 not null check (qty > 0),
  entry       float8 not null,
  "exit"      float8 not null,
  stop        float8,
  pv          float8 not null default 1,
  fees        float8 not null default 0,
  setup       text,
  mistake     text,
  rating      int check (rating between 1 and 5),
  hold        int,
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists trades_user_date_idx on public.trades (user_id, date);

-- Row level security: every person can only see and change their own trades.
alter table public.trades enable row level security;

create policy "own trades select" on public.trades
  for select using (auth.uid() = user_id);

create policy "own trades insert" on public.trades
  for insert with check (auth.uid() = user_id);

create policy "own trades update" on public.trades
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own trades delete" on public.trades
  for delete using (auth.uid() = user_id);
