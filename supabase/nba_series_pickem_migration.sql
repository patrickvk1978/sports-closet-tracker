-- NBA Series Pick'em persistence
-- Run this in your Supabase project after the base pools/profiles schema exists.

create table if not exists public.nba_series_picks (
  id uuid primary key default uuid_generate_v4(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  series_id text not null,
  round_key text not null,
  winner_team_id text not null,
  predicted_games int not null check (predicted_games between 4 and 7),
  updated_at timestamptz not null default now(),
  unique (pool_id, user_id, series_id)
);

alter table public.nba_series_picks enable row level security;

create policy "nba_series_picks_select" on public.nba_series_picks
  for select using (
    pool_id in (select pool_id from public.pool_members where user_id = auth.uid())
  );

create policy "nba_series_picks_write" on public.nba_series_picks
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter publication supabase_realtime add table public.nba_series_picks;
