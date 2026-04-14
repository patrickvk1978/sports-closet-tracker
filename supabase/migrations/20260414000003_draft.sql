-- ============================================================
-- MIGRATION 003: DRAFT SCHEMA (NFL / WNBA)
-- ============================================================

CREATE SCHEMA IF NOT EXISTS draft;

-- User's predicted draft board
CREATE TABLE IF NOT EXISTS draft.boards (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id      UUID REFERENCES public.pools(id) ON DELETE CASCADE,
  entry_id     UUID REFERENCES public.pool_entries(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES public.profiles(id),   -- legacy
  picks        JSONB NOT NULL,   -- ordered array of {slot, player_name, team, position}
  submitted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (pool_id, entry_id),
  UNIQUE (pool_id, user_id)
);

-- Actual draft results as they happen (written by ESPN poller)
CREATE TABLE IF NOT EXISTS draft.actual_picks (
  id           SERIAL PRIMARY KEY,
  pool_id      UUID REFERENCES public.pools(id) ON DELETE CASCADE,
  slot         INTEGER NOT NULL,
  player_name  TEXT NOT NULL,
  team         TEXT NOT NULL,
  position     TEXT,
  espn_id      TEXT,
  picked_at    TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_draft_actual_slot
  ON draft.actual_picks (pool_id, slot);

CREATE INDEX IF NOT EXISTS idx_draft_actual_pool
  ON draft.actual_picks (pool_id, slot);

ALTER TABLE draft.actual_picks REPLICA IDENTITY FULL;
