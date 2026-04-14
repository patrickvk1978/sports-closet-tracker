-- ─── Poller Heartbeat ─────────────────────────────────────────────────────────
-- Single-row table updated by the VPS poller after each poll cycle.
-- Lets the admin page show live poller status without SSH.

create table public.poller_heartbeat (
  id            int primary key default 1 check (id = 1),
  polled_at     timestamptz not null default now(),
  pools_found   int not null default 0,
  games_updated int not null default 0,
  live_count    int not null default 0,
  error         text
);

alter table public.poller_heartbeat enable row level security;

-- Anyone can read (admin page reads without service role)
create policy "heartbeat_select" on public.poller_heartbeat
  for select using (true);

-- Seed the single row (poller upserts into it)
insert into public.poller_heartbeat (id) values (1) on conflict do nothing;
