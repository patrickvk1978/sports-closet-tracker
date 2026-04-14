-- ─── Phase 2 Schema ────────────────────────────────────────────────────────────
-- Run this once in your Supabase project (SQL Editor > New Query).
-- After running, enable Realtime on the `games` and `scores` tables via
-- Database → Replication → Tables.

-- Required extension
create extension if not exists "uuid-ossp";

-- ─── profiles ──────────────────────────────────────────────────────────────────
-- Extends auth.users; created automatically on sign-up.
create table public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  username   text unique not null,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

-- ─── pools ─────────────────────────────────────────────────────────────────────
create table public.pools (
  id             uuid primary key default uuid_generate_v4(),
  name           text not null,
  admin_id       uuid not null references public.profiles(id),
  scoring_config jsonb not null default '{"R64":10,"R32":20,"S16":40,"E8":80,"F4":160,"Champ":320}',
  invite_code    char(6) unique not null,
  locked         boolean not null default false,
  created_at     timestamptz not null default now()
);

-- ─── pool_members ──────────────────────────────────────────────────────────────
create table public.pool_members (
  pool_id   uuid not null references public.pools(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (pool_id, user_id)
);

-- ─── games ─────────────────────────────────────────────────────────────────────
-- 63 slots seeded once before the tournament by the admin.
-- Slot 0-62 map to bracket positions (see src/lib/scoring.js for SLOT_ROUND).
create table public.games (
  id          uuid primary key default uuid_generate_v4(),
  espn_id     text unique,                       -- ESPN event ID, set when admin seeds the mapping
  slot_index  int unique not null
              check (slot_index >= 0 and slot_index <= 62),
  round       text not null,                     -- 'R64','R32','S16','E8','F4','Champ'
  region      text,                              -- 'midwest','west','south','east' or null for F4/Champ
  teams       jsonb,                             -- { team1, seed1, team2, seed2 }
  winner      text,
  status      text not null default 'pending'
              check (status in ('pending','live','final')),
  updated_at  timestamptz not null default now()
);

-- ─── brackets ──────────────────────────────────────────────────────────────────
-- One row per (user, pool). picks is a 63-element JSON array of team name strings.
create table public.brackets (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  pool_id      uuid not null references public.pools(id) on delete cascade,
  picks        jsonb not null default '[]',       -- 63-item array, index = slot_index
  locked       boolean not null default false,
  submitted_at timestamptz not null default now(),
  unique (user_id, pool_id)
);

-- ─── scores ────────────────────────────────────────────────────────────────────
-- Computed after each round; updated by the admin client or a trigger.
create table public.scores (
  id         uuid primary key default uuid_generate_v4(),
  bracket_id uuid unique not null references public.brackets(id) on delete cascade,
  pool_id    uuid not null references public.pools(id) on delete cascade,
  points     int not null default 0,
  ppr        int not null default 0,
  rank       int,
  updated_at timestamptz not null default now()
);

-- ─── Row Level Security ────────────────────────────────────────────────────────

alter table public.profiles     enable row level security;
alter table public.pools        enable row level security;
alter table public.pool_members enable row level security;
alter table public.games        enable row level security;
alter table public.brackets     enable row level security;
alter table public.scores       enable row level security;

-- profiles
create policy "profiles_select" on public.profiles
  for select using (true);
create policy "profiles_insert" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update" on public.profiles
  for update using (auth.uid() = id);

-- pools (visible only to members)
create policy "pools_select" on public.pools
  for select using (
    id in (select pool_id from public.pool_members where user_id = auth.uid())
  );
create policy "pools_insert" on public.pools
  for insert with check (auth.uid() = admin_id);
create policy "pools_update" on public.pools
  for update using (auth.uid() = admin_id);

-- pool_members
create policy "pool_members_select" on public.pool_members
  for select using (
    pool_id in (select pool_id from public.pool_members where user_id = auth.uid())
  );
create policy "pool_members_insert" on public.pool_members
  for insert with check (auth.uid() = user_id);

-- games (public read; admin write)
create policy "games_select" on public.games
  for select using (true);
create policy "games_write" on public.games
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- brackets (pool members can read; owner can write)
create policy "brackets_select" on public.brackets
  for select using (
    pool_id in (select pool_id from public.pool_members where user_id = auth.uid())
  );
create policy "brackets_write" on public.brackets
  for all using (auth.uid() = user_id);

-- scores (pool members can read)
create policy "scores_select" on public.scores
  for select using (
    pool_id in (select pool_id from public.pool_members where user_id = auth.uid())
  );
create policy "scores_write" on public.scores
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- ─── Realtime ──────────────────────────────────────────────────────────────────
-- Run after enabling Realtime in the Supabase dashboard:
--   Database → Replication → supabase_realtime → Add tables: games, scores
--
alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.scores;
